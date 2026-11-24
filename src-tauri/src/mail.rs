//! The mailboxes of the local Greenmail, where the apps on this machine send their mail.

use std::sync::LazyLock;
use std::time::Duration;

use mail_parser::{Address, MessageParser, MimeHeaders};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder().timeout(Duration::from_secs(10)).build().expect("http client always builds")
});

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Mail {
    pub id: String,
    /// Greenmail mailboxes the mail was delivered to, which also shows Bcc recipients.
    pub mailboxes: Vec<String>,
    pub subject: String,
    pub from: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    /// Epoch millis from the Date header.
    pub date: Option<i64>,
    /// A text-only mail comes as HTML too, converted by the parser.
    pub html: String,
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub content_type: String,
    pub size: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMessage {
    mime_message: String,
}

/// With auth disabled Greenmail creates a user for every recipient, so the user list is the list of mailboxes.
pub async fn inbox(base: &str) -> AppResult<Vec<Mail>> {
    let users: serde_json::Value = get(base, &["api", "user"]).await?;
    let mut mails: Vec<Mail> = Vec::new();
    for mailbox in mailbox_names(&users) {
        let messages: Vec<StoredMessage> = get(base, &["api", "user", &mailbox, "messages", "INBOX"]).await?;
        for message in messages {
            let Some(mail) = parse(&mailbox, &message.mime_message) else { continue };
            match mails.iter_mut().find(|known| known.id == mail.id) {
                Some(known) => known.mailboxes.push(mailbox.clone()),
                None => mails.push(mail),
            }
        }
    }
    mails.sort_by_key(|mail| std::cmp::Reverse(mail.date));
    Ok(mails)
}

pub async fn purge(base: &str) -> AppResult<()> {
    CLIENT
        .post(url(base, &["api", "mail", "purge"])?)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|error| unreachable(base, error))?;
    Ok(())
}

async fn get<T: serde::de::DeserializeOwned>(base: &str, segments: &[&str]) -> AppResult<T> {
    let response = CLIENT
        .get(url(base, segments)?)
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|error| unreachable(base, error))?;
    response.json().await.map_err(|error| AppError::Invalid(format!("Greenmail-Antwort nicht lesbar: {error}")))
}

/// Segment by segment, so a mailbox like `a+b@x.de` is escaped instead of breaking the path.
fn url(base: &str, segments: &[&str]) -> AppResult<reqwest::Url> {
    let mut url = reqwest::Url::parse(base)
        .map_err(|error| AppError::Invalid(format!("greenmailUrl \"{base}\" ist keine URL: {error}")))?;
    url.path_segments_mut()
        .map_err(|_| AppError::Invalid(format!("greenmailUrl \"{base}\" ist keine http-URL")))?
        .pop_if_empty()
        .extend(segments);
    Ok(url)
}

fn unreachable(base: &str, error: reqwest::Error) -> AppError {
    if error.is_connect() {
        AppError::Invalid(format!("Greenmail antwortet nicht unter {base} - seinen Stack in der Werkstatt starten"))
    } else {
        AppError::Invalid(format!("Greenmail: {error}"))
    }
}

/// Accepts `[{"login": .., "email": ..}]` as well as a plain list of addresses.
fn mailbox_names(users: &serde_json::Value) -> Vec<String> {
    users
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|user| match user {
            serde_json::Value::String(email) => Some(email.clone()),
            _ => user.get("email").or_else(|| user.get("login"))?.as_str().map(String::from),
        })
        .collect()
}

fn parse(mailbox: &str, raw: &str) -> Option<Mail> {
    let message = MessageParser::default().parse(raw.as_bytes())?;
    let date = message.date().map(|date| date.to_timestamp() * 1000);
    let subject = message.subject().unwrap_or_default().to_string();
    Some(Mail {
        id: message.message_id().map(String::from).unwrap_or_else(|| format!("{mailbox}/{date:?}/{subject}")),
        mailboxes: vec![mailbox.to_string()],
        from: addresses(message.from()).into_iter().next().unwrap_or_default(),
        to: addresses(message.to()),
        cc: addresses(message.cc()),
        date,
        html: message.body_html(0).map(|html| html.into_owned()).unwrap_or_default(),
        attachments: message
            .attachments()
            .map(|part| Attachment {
                name: part.attachment_name().unwrap_or("ohne Namen").to_string(),
                content_type: part
                    .content_type()
                    .map(|kind| format!("{}/{}", kind.ctype(), kind.subtype().unwrap_or("*")))
                    .unwrap_or_default(),
                size: part.len(),
            })
            .collect(),
        subject,
    })
}

fn addresses(address: Option<&Address>) -> Vec<String> {
    address
        .into_iter()
        .flat_map(|address| address.iter())
        .map(|addr| match (addr.name(), addr.address()) {
            (Some(name), Some(email)) => format!("{name} <{email}>"),
            (name, email) => email.or(name).unwrap_or_default().to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const RAW: &str = "From: Support <support@example.org>\r\n\
To: mail@example.com, Max <max@example.org>\r\n\
Subject: =?UTF-8?Q?Auftrag_f=C3=BCr_Schaden_123?=\r\n\
Date: Tue, 20 Oct 2026 14:05:00 +0200\r\n\
Message-ID: <abc@example.org>\r\n\
MIME-Version: 1.0\r\n\
Content-Type: multipart/mixed; boundary=\"b\"\r\n\
\r\n\
--b\r\n\
Content-Type: text/html; charset=UTF-8\r\n\
\r\n\
<p>Hallo</p>\r\n\
--b\r\n\
Content-Type: application/pdf; name=\"auftrag.pdf\"\r\n\
Content-Disposition: attachment; filename=\"auftrag.pdf\"\r\n\
Content-Transfer-Encoding: base64\r\n\
\r\n\
JVBERi0=\r\n\
--b--\r\n";

    #[test]
    fn reads_header_body_and_attachments_from_the_raw_mime() {
        let mail = parse("mail@example.com", RAW).unwrap();
        assert_eq!(mail.id, "abc@example.org");
        assert_eq!(mail.subject, "Auftrag für Schaden 123");
        assert_eq!(mail.from, "Support <support@example.org>");
        assert_eq!(mail.to, vec!["mail@example.com", "Max <max@example.org>"]);
        assert_eq!(mail.date, Some(1_792_497_900_000));
        assert!(mail.html.contains("<p>Hallo</p>"));
        assert_eq!(
            mail.attachments,
            vec![Attachment { name: "auftrag.pdf".into(), content_type: "application/pdf".into(), size: 5 }]
        );
    }

    #[test]
    fn takes_mailboxes_from_user_objects_or_plain_addresses() {
        let users = serde_json::json!([{ "login": "a", "email": "a@x.de" }, { "login": "b" }, "c@x.de"]);
        assert_eq!(mailbox_names(&users), vec!["a@x.de", "b", "c@x.de"]);
    }

    #[test]
    fn escapes_a_mailbox_in_the_path_and_keeps_a_base_path() {
        let mailbox = url("http://localhost:8282/", &["api", "user", "a+b/c@x.de"]).unwrap();
        assert_eq!(mailbox.as_str(), "http://localhost:8282/api/user/a+b%2Fc@x.de");
        assert_eq!(url("http://host/greenmail", &["api"]).unwrap().as_str(), "http://host/greenmail/api");
        assert!(url("localhost:8282", &["api"]).is_err());
    }
}
