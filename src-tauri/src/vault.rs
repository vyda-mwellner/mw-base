use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const TTL_SECS: u64 = 10 * 60 * 60;

#[derive(Clone)]
pub struct Credential {
    pub user: String,
    pub password: String,
}

struct Session {
    credential: Credential,
    expires_at: u64,
}

/// Memory only: the macOS keychain asks for its password after every rebuild of an unsigned app.
#[derive(Default)]
pub struct Vault {
    sessions: Mutex<HashMap<String, Session>>,
}

impl Vault {
    pub fn store(&self, id: &str, credential: Credential) -> u64 {
        let expires_at = now() + TTL_SECS;
        self.sessions().insert(id.to_string(), Session { credential, expires_at });
        expires_at
    }

    pub fn load(&self, id: &str) -> Option<Credential> {
        self.valid(id, |session| session.credential.clone())
    }

    pub fn unlocked_until(&self, id: &str) -> Option<u64> {
        self.valid(id, |session| session.expires_at)
    }

    pub fn forget(&self, id: &str) {
        self.sessions().remove(id);
    }

    fn valid<T>(&self, id: &str, read: impl FnOnce(&Session) -> T) -> Option<T> {
        let mut sessions = self.sessions();
        match sessions.get(id) {
            Some(session) if session.expires_at > now() => Some(read(session)),
            Some(_) => {
                sessions.remove(id);
                None
            }
            None => None,
        }
    }

    fn sessions(&self) -> std::sync::MutexGuard<'_, HashMap<String, Session>> {
        self.sessions.lock().expect("vault lock poisoned")
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|elapsed| elapsed.as_secs()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credential() -> Credential {
        Credential { user: "root".into(), password: "s3cret".into() }
    }

    #[test]
    fn hands_out_a_stored_credential_until_it_is_forgotten() {
        let vault = Vault::default();
        assert!(vault.load("prod").is_none());

        vault.store("prod", credential());
        assert_eq!(vault.load("prod").map(|c| c.password), Some("s3cret".to_string()));
        assert!(vault.unlocked_until("prod").is_some());

        vault.forget("prod");
        assert!(vault.load("prod").is_none());
    }

    #[test]
    fn drops_an_expired_credential() {
        let vault = Vault::default();
        vault.sessions().insert("dev".into(), Session { credential: credential(), expires_at: now() - 1 });

        assert!(vault.load("dev").is_none());
        assert!(vault.sessions().is_empty());
    }
}
