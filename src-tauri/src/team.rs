use std::collections::HashMap;
use std::path::Path;

use crate::config;
use crate::error::AppResult;

/// Knows the team by commit email: the author name changes from machine to machine (`M. Muster`, `mmuster`).
pub struct Team {
    names: HashMap<String, String>,
}

impl Team {
    pub fn load(root: &Path) -> AppResult<Team> {
        Ok(Team::new(config::parse(root, config::TEAM)?))
    }

    pub fn new(members: HashMap<String, Vec<String>>) -> Team {
        let names = members
            .into_iter()
            .flat_map(|(name, emails)| emails.into_iter().map(move |email| (email.trim().to_lowercase(), name.clone())))
            .collect();
        Team { names }
    }

    /// The name from the team list, else the author name as git has it.
    pub fn name(&self, author: &str, email: &str) -> String {
        self.names.get(&email.to_lowercase()).cloned().unwrap_or_else(|| author.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_a_member_by_any_of_their_emails_and_anyone_else_by_the_author_name() {
        let team = Team::new(HashMap::from([(
            "Maria".to_string(),
            vec!["m.muster@example.com".to_string(), "maria.muster@example.org".to_string()],
        )]));

        assert_eq!(team.name("mmuster", "maria.muster@example.org"), "Maria");
        assert_eq!(team.name("M. Muster", "M.Muster@example.com"), "Maria");
        assert_eq!(team.name("Erika Beispiel", "erika@example.net"), "Erika Beispiel");
    }

    #[test]
    fn reads_the_team_list_of_the_data_folder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("git")).unwrap();
        std::fs::write(dir.path().join(config::TEAM), r#"{ "Robert": ["r.beispiel@example.com"] }"#).unwrap();

        let team = Team::load(dir.path()).unwrap();

        assert_eq!(team.name("robert-gh", "r.beispiel@example.com"), "Robert");
    }
}
