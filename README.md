# Base

Das Arbeits-Cockpit als Bürogebäude, vorne aufgeschnitten, in einem Tablet-Fenster (700 x 928). Eine Figur läuft durch die Räume und fährt mit dem Glasaufzug. Die Dinge in den Räumen öffnen Blätter. Angular 22 in einem Tauri-2-Fenster, die Daten liegen als JSON in `~/.config/base`. Löst `mw-cockpit` ab, alles von dort ist umgezogen.

```
npm install
npm test             # Angular specs
npm run test:rust    # the Rust shell (needs `npm run build` once)
npm start            # browser at http://localhost:4242, data in localStorage, no stages or git
npm run desktop      # the real window, data in ~/.config/base
./release.sh         # build the app and install it into ~/Apps, for Spotlight and Launchpad
```

`release.sh` ersetzt ein schon installiertes `Base.app`. Nach einer Code-Änderung einfach noch einmal laufen lassen.

## Das Gebäude

Jeder Raum hat ein Thema: unten die Stages, im Erdgeschoss alles Lokale und der Empfang, oben Git und Wissen.

| Etage | Links | Rechts |
| --- | --- | --- |
| 2 | Dachterrasse: Entspannen, Kilometerstand | Dachboden: Backup, Haustechnik, Claude-Zähler |
| 1 | Büro (Git): Commit-Suche, Gleisplan, Releases | Bibliothek: Vault, Dojo |
| E | Werkstatt (lokal): Container, Dev-Server, Postfach, Landkarte | Empfang: Schlüsselbrett, Markdown, Nachrichten, Arbeitstage |
| U | Serverraum (Stages): Port-Forwards, Cluster, Daten, Restarts | Pausenraum: Stapler, Läufer, Bugjagd |

Was die Dinge können:

- **Serverraum:** alles zu DEV, TEST und PROD.
  - Cluster mit Logs auf dem Schreibtisch
  - Restarts als Schild "Tage ohne Restart"
  - Port-Forwards am Patchfeld
  - Daten als Abfragen am DB-Schrank
  - Das Rack und die Monitore zeigen den Zustand jeder Stage.
- **Büro:** die Git-Seite.
  - Gleisplan als Modellbahn, mit "Alle fetchen", den GUI-Links und GitHub
  - Releases je Stufe zum Kopieren
  - Commit-Suche am Rechner
- **Werkstatt:**
  - Container: die Stacks von local-setup starten, neu starten und stoppen, mit der Ausgabe von `setup.sh` und ob ihre Dienste antworten. Das Rack zeigt, welche laufen.
  - Dev-Server: die Frontends mit `nx serve` oder `npm start` starten, stoppen und im Browser öffnen, Favoriten, die Ausgabe auf dem Schreibtisch, darunter die Backends mit Health. Der Sicherungskasten zeigt, welche laufen.
  - Postfach: alle Postfächer des lokalen Greenmail, eine Mail im eigenen Blatt
  - Landkarte: die Apps nach Gruppe aus einem Scan der Checkouts, je App Ports, Aufrufe, Code und Git auf dem Schreibtisch. R zeichnet alle hochkant auf den Schreibtisch, oben die GUIs, darunter Backends und Dienste, unten die Infrastruktur, eine Farbe je Backend. Q kopiert die Zeichnung als helles PNG für Teams oder Confluence, wie "PNG kopieren" unter den Diagrammen der Abfragen.
- **Empfang:**
  - Arbeitstage nach Quartal und Jahr mit Urlaub
  - Schlüsselbrett mit allen offenen Passwörtern und Forwards und "Alles zu"
  - Markdown mit Kennzahlen, `mermaid`-Blöcke als Diagramm
  - Nachrichten: der Stack-Kurier mit den vier neuesten Linien von Angular, Nx, Spring Boot, Kotlin, Java, Node, nginx und Keycloak und wie lange sie Support haben. LTS-Linien tragen eine Marke, bei nginx die stable-Linien mit gerader Nummer. Live von endoflife.date, Nx von npm über deps.dev mit 18 Monaten je Major nach nx.dev. Gelesen beim Start, Q lädt neu.
- **Bibliothek:** Vault mit den Notizen des Vault-Skills, eine Notiz auf dem Schreibtisch mit Diagrammen und Links zu anderen Notizen
- **Dachboden:**
  - Backup: kopiert den Plan aus `einstellungen/backup.json`, nur was sich geändert hat. Das Schloss der Truhe ist zu, solange der letzte Lauf jünger als eine Woche und fehlerfrei ist.
  - Haustechnik: zeigt, welche Konfiguration fehlt.
  - Claude-Zähler: was Claude Code laut `ccusage` heute, im Monat und pro Tag gekostet hätte, dazu der teuerste Tag und an wie vielen Tagen es lief. Der Schnitt zählt nur Tage mit Nutzung, auch am Wochenende. Die Säule ist voll am teuersten Tag der letzten 30.
- **Dachterrasse:**
  - Entspannen auf der Liege: vier Sekunden ein, sieben aus, acht halten, acht Runden, mit Kreis und Klängen. Q startet und stoppt.
  - Kilometerstand: wie viele Schritte und Meter die Figur heute gelaufen ist und wie viele Etagen sie gefahren ist, dazu jeder Tag einzeln. Die Tafel zeigt die letzten sieben Tage als Balken.
- **Überall:** Befehl mit B, auf dem Schreibtisch: "starte shop-gui und den mail container" getippt oder diktiert, für Dev-Server und Stacks. B wirkt nicht, solange ein offenes Feld, das Dojo oder ein Spiel die Tasten hat.
- **Meldungen:** Q klappt die Liste unter der Insel auf, W/S wählt, Enter geht direkt zum Ding der Meldung.

## Datenordner

`~/.config/base`, oder `$BASE_HOME`. Alles, was eine Firma ausmacht (Hosts, Layout des gitops-Repos, Namen, Abfragen), steht nur hier, nie im Code.

| Pfad | Was | Wer schreibt |
| --- | --- | --- |
| `einstellungen/pfade.json` | `workspaceDir` (der Ordner mit dem gitops-Checkout und den App-Repos), `kubeconfigDir` (leer: `~/.kube`), `kubeconfigFile` (Dateiname mit `{env}`, leer: `{env}.yaml`), `localSetupDir` (leer: `local-setup` im Workspace), `greenmailUrl` (die API des lokalen Greenmail), `vaultDir` (der Ordner mit `INDEX.md`) | von Hand |
| `einstellungen/backup.json` | `targetDir` und je Eintrag `source`, `target` und `exclude` (wie `.gitignore`-Zeilen) | von Hand |
| `einstellungen/marke.json` | `name` der Firma auf dem Schild vor dem Haus und am Empfang; ohne Datei bleibt das Schild leer und am Empfang steht "EMPFANG" | von Hand |
| `git/gitops.json` | Layout des gitops-Repos, siehe unten | von Hand |
| `git/jira.json`, `git/team.json` | Jira-Projekte, Namen zu Commit-Mails | von Hand |
| `landschaft/apps.json` | die Apps mit Repo, Namespace und gitops-Einheit, `stack` (der Ordner von local-setup, der sie startet) und `health` (`http://...` wird abgefragt, `tcp://host:port` nur verbunden); optional `ownCode`, die Package-Präfixe des eigenen Codes für die Logs | von Hand |
| `stages/verbindungen.json` | DB-Verbindungen | von Hand |
| `stages/forwards.json` | Port-Forwards | von Hand |
| `stages/abfragen/<n>_<Bereich>/*.sql` | die Abfragen, siehe unten | von Hand |
| `stages/restarts.json` | seit wann jede Stage beobachtet wird, letzter Neustart | die Shell |
| `landschaft/scan.json` | der letzte Scan der Landkarte | die Shell |
| `werkstatt/dev-server.json` | die laufenden Dev-Server, damit ein Neustart der Shell sie übernimmt | die Shell |
| `haus/`, `kalender/` | Rekorde, Dojo, Gesehenes, Dev-Favoriten, letzter Backup-Lauf, Kilometerstand der Figur, Urlaub | das Fenster |

`git/gitops.json`, die Platzhalter `{env}` und `{unit}` füllt die Shell:

```json
{
  "repo": "gitops",
  "mainBranch": "main",
  "branches": { "dev": "main", "test": "main", "prod": "prod" },
  "cluster": "clusters/{env}/kustomization.yaml",
  "unit": "deploy/overlays/{env}/{unit}",
  "ingress": "deploy/units/{unit}/overlays/{env}/ingress.yaml",
  "preferredDomain": ".example.org"
}
```

- `repo` ist der Ordner des Checkouts im Workspace.
- Der Cluster einer Stage liest `origin/<branches[env]>`, eine Stage ohne Eintrag liest `mainBranch`.
- Der Tag einer Einheit ist `newTag` in `<unit>/kustomization.yaml`. Aktiv ist sie, wenn eine nicht auskommentierte Zeile der Cluster-Kustomization auf ihren Pfad endet.
- Die Startseite einer GUI ist der erste Host im Ingress, der auf `preferredDomain` endet, sonst der erste überhaupt.

Der Store des Fensters schreibt nie in `stages/`, `git/`, `landschaft/`, `einstellungen/` oder `werkstatt/`, sonst könnte die Webview umdefinieren, wohin eine Verbindung oder ein Forward zeigt oder welche Prozessgruppe ein Dev-Server ist. Passwörter bleiben 10 Stunden im Speicher der Shell und kommen nie auf die Platte, Logs nur im Speicher.

## Abfragen

Jede `.sql`-Datei unter `stages/abfragen/` ist ein Eintrag. Ein Unterordner ist ein Bereich, `2_Auswertungen` zeigt sich als "Auswertungen", die Zahl legt nur die Reihenfolge fest. Die Datei beginnt mit einem Kommentarblock, mit `-- section:` hält sie mehrere Abschnitte, jeder mit eigenem Ergebnis.

```sql
-- title: Wochenübersicht
-- description: Eingänge pro Kalenderwoche
-- param: wochen = 5 | 10 | 20

-- section: Eingänge nach Kanal
-- chart: stacked
-- x: woche
-- series: kanal
-- y: anzahl
-- info: Die letzte Woche läuft noch und ist deshalb niedriger.
SELECT to_char(week_start, '"KW" IW') AS woche, kanal, count(*) AS anzahl ...
```

| Schlüssel | Wo | Bedeutung |
| --- | --- | --- |
| `title`, `description` | Abfrage | Name und Zeile in der Liste |
| `connections` | Abfrage | Verbindungs-IDs, für die es die Abfrage gibt, ohne: alle |
| `param` | Abfrage | `name` oder `name uuid` für ein Feld, `name = a \| b` für eine Wahl |
| `section` | Abschnitt | beginnt einen Abschnitt mit diesem Titel |
| `chart` | Abschnitt | `bar`, `hbar`, `stacked`, `line`, `stat` (eine große Zahl), `record` (erste Zeile als Liste), `text` (erste Spalte als Block zum Kopieren) oder `table` (Standard) |
| `x`, `y`, `series` | Abschnitt | Kategorie, Wertespalten, und für Zeilen wie (x, Serie, y) die Spalte, die die Serien macht |
| `info` | Abschnitt | wie das Ergebnis zu lesen ist |
| `link` | Abschnitt | `spalte -> param`: eine Zelle öffnet die erste Abfrage mit diesem Param und führt sie mit dem Wert aus |

Params werden als Text gebunden, nie ins SQL kopiert: `:name`, und gecastet, wo nötig, `:batchId::uuid`. Ein Diagramm hat vier Farben, mehr Serien fasst es als "Sonstige" grau zusammen; die Tabelle liegt immer aufklappbar darunter. "PNG kopieren" unter einem Diagramm legt es hell, mit Titel, Verbindung, Zeitpunkt und Params, als PNG in die Zwischenablage. Jeder Abschnitt läuft lesend in einem eigenen Savepoint.

## Wo was liegt

- `src/app/building/`: was das Gebäude ist. `building.config.ts` (Etagen, Räume, Dinge), `rooms.ts` (wie jeder Raum aussieht), `facts.ts` (was die Räume zeigen).
- `src/app/stages/`: Cluster, Restarts, Forwards, Daten, Schlüsselbrett, Haustechnik.
- `src/app/deploy/`: Gleisplan, Releases, Commit-Suche.
- `src/app/workshop/`: die Werkstatt, Container, Dienste, Dev-Server, Befehl, Postfach, Landkarte.
- `src/app/library/`: Vault. `src/app/archive/`: Backup. `src/app/roof/`: Claude-Zähler.
- `src/app/calendar/`: Arbeitstage, Feiertage, Urlaub.
- `src/app/news/`: Nachrichten, als erster Abschnitt der Stack-Kurier. Eine weitere Quelle, etwa CVEs, kommt als eigener Abschnitt mit eigenem State dazu.
- `src/app/relax/`: die Dachterrasse, Atmen und Kilometerstand.
- `src/app/house/state/`: `house-status.ts` macht aus den Zuständen, was Räume, Notizen und die Leitung unten zeigen; `brand.ts` liest den Firmennamen.
- `src/app/engine/`, `scene/`, `ui/`, `arcade/`, `dojo/`, `workbench/`: aus dem building-kit.
- `src-tauri/`: Fenster, Dokumentenspeicher und die Befehle aus dem Cockpit: kubectl (`kube.rs`, `cluster.rs`, `logs.rs`, `incidents.rs`), Postgres (`connections.rs`, `postgres.rs`, `queries.rs`, `vault.rs`), Git (`deploy.rs`, `tickets.rs`, `team.rs`), lokal (`docker.rs`, `health.rs`, `devserver.rs`, `mail.rs`, `landscape/`), Notizen und Backup (`notes.rs`, `backup.rs`), ccusage (`usage.rs`). Die Pfade im Datenordner stehen in `config.rs`.
