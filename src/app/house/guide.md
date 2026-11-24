# Hausführer

Wo was steht und was die Lampen, Schilder und Anzeigen bedeuten. Esc schließt ihn wieder.

## Tasten

| Taste     | Was                                                                                          |
| --------- | -------------------------------------------------------------------------------------------- |
| A / D     | laufen                                                                                       |
| W / S     | am Aufzug die Etage wählen, im Raum ein Ding wählen                                          |
| Enter     | den Raum betreten, das gewählte Ding öffnen; im Hof vor dem blauen Auto Feierabend           |
| Leertaste | springen: unter einer Markierung gilt die Meldung als gesehen, unter Markdown öffnet es sich |
| Esc       | zurück; im Haus viermal schnell hintereinander beendet die App                               |
| Q         | Meldungen aufklappen                                                                         |
| B         | Befehl auf dem Schreibtisch                                                                  |
| T         | Ton an und aus                                                                               |
| I         | dieser Hausführer                                                                            |
| ⌘ F       | auf dem Schreibtisch suchen                                                                  |

## Das Haus

| Etage | Links        | Rechts     |
| ----- | ------------ | ---------- |
| 2     | Dachterrasse | Dachboden  |
| 1     | Büro         | Bibliothek |
| E     | Werkstatt    | Empfang    |
| U     | Serverraum   | Pausenraum |

In der Mitte liegt das Treppenhaus mit dem Glasaufzug. Die Dinge stehen in jedem Raum unten von links nach rechts.

## Überall

- **Markierung über einem Ding:** eine Sprechblase mit Ausrufezeichen in der Farbe der Meldung. Rot ist ein Fehler, gelb eine Warnung, blau etwas Neues. Spring darunter hoch, dann gilt das Neue als gesehen und die Blase platzt. Fehler und Warnungen bleiben, bis die Ursache weg ist.
- **Insel oben:** die Kalenderwoche und "alles ruhig", solange nichts los ist. Sonst stehen dort die Meldungen (Q klappt sie auf) oder mit Balken das, was gerade läuft.
- **Leuchtfeuer am Mast auf dem Dach:** die Farbe der dringendsten Meldung im Haus. Ohne Meldung ist es aus.
- **Rohr unter dem Keller:** fünf Fenster. "Meldungen" zählt die offenen Meldungen. Quartal und Jahr zeigen die Netto-Arbeitstage, die noch übrig sind, der Balken darunter, wie viel vom Zeitraum vorbei ist. "Feiertag" sind die Tage bis zum nächsten, "PROD ruhig" die Tage ohne Restart auf PROD.
- **Solarpanels auf dem Dach:** der Arbeitstag von 8 bis 17 Uhr. Jede Panelhälfte ist eine Stunde und leuchtet auf, sobald die Stunde vorbei ist, von links nach rechts. Die Mittagspause von 12 bis 13 Uhr liegt zwischen dem zweiten und dem dritten Panel.
- **Leuchtziffern am Aufzugshaus auf dem Dach:** die Temperatur draußen, "--", solange sie unbekannt ist.
- **Himmel und Wetter:** der Himmel folgt der Tageszeit. Wolken, Regen und Schnee kommen von Open-Meteo für den Ort aus dem Datenordner. Ohne Ort bleibt der Himmel klar.
- **Blaues Auto im Hof:** davor öffnet Enter den Feierabend: der Tag in Zahlen, was noch läuft (Stacks, Dev-Server, Forwards) mit Knöpfen zum Stoppen und der nächste Arbeitstag. Enter ohne gewählten Knopf schließt die App.
- **Firmenschild vor dem Haus und über dem Empfang:** der Name aus `einstellungen/marke.json`. Ohne Datei steht am Empfang "EMPFANG".
- **Jahreszeiten:** Im Advent (1. bis 26.12.) steht im Empfang ein Weihnachtsbaum und auf dem Dach hängt eine Lichterkette. An Silvester und Neujahr steigen Raketen. Vom 28. bis 31.10. stehen Kürbisse in Werkstatt und Empfang. Von Gründonnerstag bis Ostermontag liegen Eier im Büro und in der Bibliothek.

## U Serverraum: die Stages

| Ding          | Wo                            | Was                                                       |
| ------------- | ----------------------------- | --------------------------------------------------------- |
| Daten         | DB-Rack ganz links            | Abfragen an den DB-Verbindungen                           |
| Port-Forwards | Patchfeld unter den Monitoren | Forwards starten und stoppen                              |
| Cluster       | Monitorwand                   | Zustand von DEV, TEST und PROD, Logs auf dem Schreibtisch |
| Restarts      | Schild rechts                 | Tage ohne Restart je Stage                                |

- **DB-Rack:** eine Einheit pro DB-Verbindung, von oben. Gold, solange ihr Passwort entsperrt ist, sonst grün. Dunkel ist ein freier Platz.
- **Patchfeld:** ein Port pro Forward. Grün mit Kabel nach unten heißt, er läuft. Dunkel ist aus.
- **Monitore:** ein Bildschirm pro Stage. Der Kopf ist grün, wenn alles läuft, gelb bei einer Warnung, rot bei einem Fehler und blau bei einem Hinweis. Grau heißt, die Stage wurde noch nicht gelesen.
- **Schild "Tage ohne Restart":** je Stage die Tage seit dem letzten Neustart eines Containers. Eine 0 ist rot, "--" heißt unbekannt.

## U Pausenraum: Spiele

| Ding    | Wo                                | Was         |
| ------- | --------------------------------- | ----------- |
| Stapler | Spielautomat links                | Stapelspiel |
| Bugjagd | Bildschirm an der Wand            | Bugs jagen  |
| Läufer  | großer Bildschirm vor den Sesseln | Laufspiel   |

- **Anzeige "HI" an der Wand:** der Rekord im Stapler.
- **Lampe an jedem Spiel:** grün, sobald die Tagesaufgabe in diesem Spiel geschafft ist.

## E Werkstatt: alles Lokale

| Ding       | Wo                           | Was                                                        |
| ---------- | ---------------------------- | ---------------------------------------------------------- |
| Container  | Container-Stapel links       | Stacks von local-setup starten, neu starten und stoppen    |
| Dev-Server | Sicherungskasten an der Wand | Frontends starten, stoppen und öffnen, Backends mit Health |
| Postfach   | gelber Briefkasten darunter  | die Mails im lokalen Greenmail                             |
| Landkarte  | Blaupause rechts             | die Apps mit Ports, Aufrufen, Code und Git                 |

- **Container-Stapel:** ein Container pro Stack, von unten. Grüne Lampe heißt, er läuft. Gelbe Lampe und abgedunkelt heißt gestoppt. Grau ohne Lampe ist ein freier Platz oder noch nicht gelesen. Leuchten alle Lampen rot, antwortet Docker nicht.
- **Sicherungskasten:** ein Schalter pro Dev-Server. Hebel oben und grün heißt, er läuft.
- **Briefkasten:** pro wartender Mail schaut ein Brief heraus, höchstens drei.

## E Empfang

| Ding           | Wo                               | Was                                                     |
| -------------- | -------------------------------- | ------------------------------------------------------- |
| Schlüsselbrett | Brett an der linken Wand         | alle offenen Passwörter und Forwards, "Alles zu"        |
| Markdown       | Schild an der Decke              | Markdown-Werkzeug, öffnet sich auch per Sprung          |
| Nachrichten    | Zeitung über dem Tresen          | Stack-Kurier: Versionen und wie lange sie Support haben |
| Witz des Tages | Abreißkalender neben der Zeitung | jeden Tag ein Witz als Toast                            |
| Arbeitstage    | Tafel rechts                     | Arbeitstage nach Quartal und Jahr, Urlaub               |

- **Schlüsselbrett:** ein Haken pro DB-Verbindung mit Passwort und pro laufendem Forward. Hängt der Schlüssel, ist der Zugang zu. Fehlt er, ist der Zugang offen.
- **Tafel:** oben die Kalenderwoche, dann eine Spalte für das Quartal und eine für das Jahr. Die Zeilen zählen die Arbeitstage ab heute: MO-FR, MO-DO und NETTO (Montag bis Donnerstag ohne Urlaub). Der Balken unten zeigt, wie viel vom Zeitraum vorbei ist.

## 1 Büro: Git

| Ding         | Wo                            | Was                                                                   |
| ------------ | ----------------------------- | --------------------------------------------------------------------- |
| Commit-Suche | Rechner am Schreibtisch links | Commits suchen                                                        |
| Gleisplan    | Modellbahn                    | was auf welcher Stage liegt, "Alle fetchen", Links zu GUIs und GitHub |
| Releases     | Pinnwand rechts               | Releases je Stufe zum Kopieren                                        |

- **Modellbahn:** ein Gleis pro Repo, hinten die Bahnhöfe DEV, TEST und PROD. Jeder Wagen ist ein Commit, der noch nicht auf PROD ist. Höchstens drei Gleise mit je sechs Wagen.

## 1 Bibliothek

| Ding  | Wo                    | Was                                 |
| ----- | --------------------- | ----------------------------------- |
| Vault | Bücherregal links     | die Notizen des Vault-Skills        |
| Dojo  | Stehpult in der Mitte | Vim-Lektionen, eine Runde sind zehn |

- **Bücher:** ein Teil steht immer da. Dazu kommt ein Buch pro Notiz im Vault, erst im linken, dann im rechten Regal.
- **Ablage oben auf dem linken Regal:** ein Brief pro Notiz im Eingang des Vault, der oberste rot gestempelt.
- **Dojo-Bildschirm:** unten zehn Punkte, einer pro heute gelöster Lektion. Sind alle zehn voll, werden sie gold.

## 2 Dachterrasse

| Ding           | Wo               | Was                                                     |
| -------------- | ---------------- | ------------------------------------------------------- |
| Entspannen     | Liege            | vier Sekunden ein, sieben aus, acht halten, acht Runden |
| Kilometerstand | Tafel am Pfosten | Schritte, Meter und Etagen der Figur                    |

- **Tafel:** ein Balken pro Tag der letzten sieben, gemessen am besten davon. Heute ist gold.

## 2 Dachboden

| Ding          | Wo                                    | Was                                           |
| ------------- | ------------------------------------- | --------------------------------------------- |
| Haustechnik   | Kasten mit Display an der linken Wand | welche Konfiguration fehlt                    |
| Backup        | Truhe                                 | den Backup-Plan laufen lassen                 |
| Claude-Zähler | Säule rechts                          | was Claude Code laut `ccusage` gekostet hätte |

- **Schloss der Truhe:** gold, solange der letzte Lauf jünger als eine Woche und fehlerfrei ist, sonst rot.
- **Lampen am Deckel der Truhe:** eine pro Backup-Job. Grün heißt gesichert, sonst leuchtet sie in der Farbe seiner Meldung.
- **Claude-Zähler:** die Säule zeigt die Kosten von heute, gemessen am teuersten Tag der letzten 30. Ist heute dieser Tag, ist sie voll und gold.
