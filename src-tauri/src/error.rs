use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Invalid(String),
    #[error("Verbindung '{0}' ist gesperrt - bitte zuerst das Passwort eingeben")]
    Locked(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Postgres(String),
    #[error("{0}")]
    Docker(String),
    #[error("TLS: {0}")]
    Tls(#[from] native_tls::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}

/// The Display of tokio_postgres::Error is just "db error" - the server message sits in the DbError.
impl From<tokio_postgres::Error> for AppError {
    fn from(error: tokio_postgres::Error) -> Self {
        let Some(db) = error.as_db_error() else {
            return match std::error::Error::source(&error) {
                Some(source) => AppError::Postgres(format!("{error}: {source}")),
                None => AppError::Postgres(error.to_string()),
            };
        };
        let mut message = format!("{}: {}", db.severity(), db.message());
        if let Some(detail) = db.detail() {
            message.push_str(&format!("\n{detail}"));
        }
        if let Some(hint) = db.hint() {
            message.push_str(&format!("\nHinweis: {hint}"));
        }
        AppError::Postgres(message)
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
