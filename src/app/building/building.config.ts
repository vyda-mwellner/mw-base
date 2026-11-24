import type { BuildingSpec } from '../engine/model';

/**
 * The building: floors from the bottom up, on each the rooms left of the stairwell and right of it, and the
 * things in each room. Every room needs an entry in `ART` (`rooms.ts`), every thing a route (`app.routes.ts`)
 * or it opens the placeholder. `building.spec.ts` checks both, and that each side is as wide on every floor.
 *
 * A standard room is drawn on a canvas 171 wide (`DRAWN` in `engine/geometry.ts`): its things are measured from
 * the left edge of that canvas and the plan moves them with the art. An open room, or one with a `width` of its
 * own, is measured in its real width.
 */
export const BUILDING: BuildingSpec = {
  ground: 1,
  floors: [
    {
      sign: 'U',
      left: [
        {
          id: 'serverraum',
          label: 'Serverraum',
          spread: { at: 67, left: 12, right: 6 },
          things: [
            { id: 'daten', label: 'Daten', at: 41, width: 34, height: 114, stand: 52 },
            { id: 'forwards', label: 'Port-Forwards', at: 84, width: 34, height: 16, lift: 56, stand: 70 },
            { id: 'cluster', label: 'Cluster', at: 97, width: 66, height: 26, lift: 92, stand: 96 },
            { id: 'restarts', label: 'Restarts', at: 153, width: 28, height: 42, lift: 94, stand: 142 },
          ],
        },
      ],
      right: [
        {
          id: 'pausenraum',
          label: 'Pausenraum',
          spread: { at: 80, left: 18, right: 4 },
          things: [
            { id: 'stapler', label: 'Stapler', at: 48, width: 40, height: 96, stand: 66, full: true },
            {
              id: 'bugjagd',
              label: 'Bugjagd',
              at: 98,
              width: 34,
              height: 26,
              lift: 76,
              stand: 92,
              full: true,
            },
            { id: 'laeufer', label: 'Läufer', at: 112, width: 62, height: 62, stand: 118, full: true },
          ],
        },
      ],
    },
    {
      sign: 'E',
      left: [
        {
          id: 'werkstatt',
          label: 'Werkstatt',
          spread: { at: 67, left: 12, right: 6 },
          things: [
            { id: 'container', label: 'Container', at: 41, width: 36, height: 100, stand: 52 },
            { id: 'devserver', label: 'Dev-Server', at: 87, width: 42, height: 46, lift: 76, stand: 68 },
            { id: 'postfach', label: 'Postfach', at: 97, width: 16, height: 24, lift: 46, stand: 84 },
            { id: 'landkarte', label: 'Landkarte', at: 137, width: 46, height: 52, lift: 72, stand: 118 },
          ],
        },
      ],
      right: [
        {
          id: 'empfang',
          label: 'Empfang',
          spread: { at: 112, left: 12, right: 10 },
          things: [
            { id: 'schluessel', label: 'Schlüsselbrett', at: 38, width: 18, height: 32, lift: 62, stand: 24 },
            {
              id: 'markdown',
              label: 'Markdown',
              at: 62,
              width: 22,
              height: 15,
              lift: 119,
              stand: 50,
              tool: 'markdown',
            },
            { id: 'nachrichten', label: 'Nachrichten', at: 73, width: 20, height: 26, lift: 64, stand: 72 },
            { id: 'arbeitstage', label: 'Arbeitstage', at: 127, width: 54, height: 84, lift: 42, stand: 104 },
          ],
        },
      ],
    },
    {
      sign: '1',
      left: [
        {
          id: 'buero',
          label: 'Büro',
          spread: { at: 90, left: 12, right: 6 },
          things: [
            { id: 'suche', label: 'Commit-Suche', at: 45, width: 28, height: 22, lift: 46, stand: 20 },
            { id: 'gleisplan', label: 'Gleisplan', at: 114, width: 82, height: 40, stand: 88 },
            { id: 'releases', label: 'Releases', at: 139, width: 52, height: 48, lift: 70, stand: 150 },
          ],
        },
      ],
      right: [
        {
          id: 'bibliothek',
          label: 'Bibliothek',
          spread: { at: 120, left: 6, right: 8 },
          things: [
            { id: 'vault', label: 'Vault', at: 37, width: 40, height: 116, stand: 46 },
            { id: 'dojo', label: 'Dojo', at: 76, width: 26, height: 20, lift: 43, stand: 96, full: true },
          ],
        },
      ],
    },
    {
      sign: '2',
      left: [
        {
          id: 'dachterrasse',
          label: 'Dachterrasse',
          open: true,
          things: [
            { id: 'atmen', label: 'Entspannen', at: 55, width: 56, height: 28, stand: 20 },
            {
              id: 'kilometerstand',
              label: 'Kilometerstand',
              at: 130,
              width: 18,
              height: 22,
              lift: 35,
              stand: 112,
            },
          ],
        },
      ],
      right: [
        {
          id: 'dachboden',
          label: 'Dachboden',
          spread: { at: 90, left: 16, right: 10 },
          things: [
            {
              id: 'haustechnik',
              label: 'Haustechnik',
              at: 48.5,
              width: 24,
              height: 32,
              lift: 74,
              stand: 38.5,
            },
            { id: 'backup', label: 'Backup', at: 57.5, width: 50, height: 34, stand: 94.5 },
            { id: 'verbrauch', label: 'Claude-Zähler', at: 156, width: 12, height: 56, lift: 6, stand: 142 },
          ],
        },
      ],
    },
  ],
};
