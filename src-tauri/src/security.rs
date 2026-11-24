//! The security advisories of CERT-Bund's WID, the warning service of the BSI: its RSS feed as it is.

use std::sync::LazyLock;
use std::time::Duration;

use crate::error::{AppError, AppResult};

const FEED: &str = "https://wid.cert-bund.de/content/public/securityAdvisory/rss";

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder().timeout(Duration::from_secs(15)).build().expect("http client always builds")
});

/// Fetched here because the webview only reaches hosts that send CORS headers; parsed on the Angular side.
pub async fn feed() -> AppResult<String> {
    let response =
        CLIENT.get(FEED).send().await.map_err(|error| AppError::Invalid(format!("wid.cert-bund.de: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Invalid(format!("wid.cert-bund.de antwortet mit {status}")));
    }
    response.text().await.map_err(|error| AppError::Invalid(format!("wid.cert-bund.de: {error}")))
}
