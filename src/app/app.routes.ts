import { CanMatchFn, Routes } from '@angular/router';

import { placeOf, ROOMS } from './engine/plan';
import { House } from './house/house';

const isRoom: CanMatchFn = (_route, segments) => ROOMS.some((room) => room.id === segments[0]?.path);
const isThing: CanMatchFn = (_route, segments) =>
  placeOf(segments.map((segment) => segment.path).join('/')).thing !== null;

/**
 * A thing of the building opens at `<room id>/<thing id>`; one without a route of its own opens the placeholder.
 * A thing with more than one page brings its own child routes: the pages lie under it, and Escape goes up one level.
 */
export const routes: Routes = [
  {
    path: '',
    component: House,
    children: [
      { path: '', pathMatch: 'full', children: [] },
      {
        path: 'serverraum/cluster',
        loadComponent: () => import('./stages/pages/cluster-sheet/cluster-sheet').then((m) => m.ClusterSheet),
      },
      {
        path: 'serverraum/restarts',
        loadComponent: () =>
          import('./stages/pages/restarts-sheet/restarts-sheet').then((m) => m.RestartsSheet),
      },
      {
        path: 'serverraum/forwards',
        loadComponent: () =>
          import('./stages/pages/forwards-sheet/forwards-sheet').then((m) => m.ForwardsSheet),
      },
      {
        path: 'serverraum/daten',
        loadComponent: () => import('./stages/pages/data-sheet/data-sheet').then((m) => m.DataSheet),
      },
      {
        path: 'werkstatt/container',
        loadComponent: () =>
          import('./workshop/pages/container-sheet/container-sheet').then((m) => m.ContainerSheet),
      },
      {
        path: 'werkstatt/devserver',
        loadComponent: () =>
          import('./workshop/pages/devserver-sheet/devserver-sheet').then((m) => m.DevserverSheet),
      },
      {
        path: 'werkstatt/landkarte',
        loadComponent: () => import('./workshop/pages/map-sheet/map-sheet').then((m) => m.MapSheet),
      },
      {
        path: 'werkstatt/postfach',
        loadComponent: () => import('./workshop/pages/mail-sheet/mail-sheet').then((m) => m.MailSheet),
      },
      {
        path: 'werkstatt/postfach/:id',
        loadComponent: () => import('./workshop/pages/mail-page/mail-page').then((m) => m.MailPage),
      },
      {
        path: 'buero/gleisplan',
        loadComponent: () => import('./deploy/pages/track-sheet/track-sheet').then((m) => m.TrackSheet),
      },
      {
        path: 'buero/suche',
        loadComponent: () => import('./deploy/pages/search-sheet/search-sheet').then((m) => m.SearchSheet),
      },
      {
        path: 'buero/releases',
        loadComponent: () => import('./deploy/pages/release-sheet/release-sheet').then((m) => m.ReleaseSheet),
      },
      {
        path: 'empfang/schluessel',
        loadComponent: () => import('./stages/pages/keys-sheet/keys-sheet').then((m) => m.KeysSheet),
      },
      {
        path: 'dachterrasse/atmen',
        loadComponent: () =>
          import('./relax/pages/breathing-sheet/breathing-sheet').then((m) => m.BreathingSheet),
      },
      {
        path: 'dachterrasse/kilometerstand',
        loadComponent: () =>
          import('./relax/pages/movement-sheet/movement-sheet').then((m) => m.MovementSheet),
      },
      {
        path: 'dachboden/verbrauch',
        loadComponent: () => import('./roof/pages/usage-sheet/usage-sheet').then((m) => m.UsageSheet),
      },
      {
        path: 'dachboden/backup',
        loadComponent: () => import('./archive/pages/backup-sheet/backup-sheet').then((m) => m.BackupSheet),
      },
      {
        path: 'dachboden/haustechnik',
        loadComponent: () => import('./stages/pages/setup-sheet/setup-sheet').then((m) => m.SetupSheet),
      },
      {
        path: 'empfang/nachrichten',
        loadComponent: () => import('./news/pages/news-sheet/news-sheet').then((m) => m.NewsSheet),
      },
      {
        path: 'empfang/nachrichten/witz',
        loadComponent: () => import('./news/pages/joke-sheet/joke-sheet').then((m) => m.JokeSheet),
      },
      {
        path: 'empfang/nachrichten/security',
        loadComponent: () =>
          import('./news/pages/security-sheet/security-sheet').then((m) => m.SecuritySheet),
      },
      {
        path: 'empfang/nachrichten/stack-kurier',
        loadComponent: () => import('./news/pages/stack-sheet/stack-sheet').then((m) => m.StackSheet),
      },
      {
        path: 'empfang/arbeitstage',
        loadComponent: () =>
          import('./calendar/pages/workdays-sheet/workdays-sheet').then((m) => m.WorkdaysSheet),
      },
      {
        path: 'bibliothek/vault',
        loadComponent: () => import('./library/pages/vault-sheet/vault-sheet').then((m) => m.VaultSheet),
      },
      {
        path: 'bibliothek/dojo',
        loadComponent: () => import('./dojo/pages/dojo/dojo').then((m) => m.Dojo),
      },
      {
        path: 'pausenraum/stapler',
        loadComponent: () => import('./arcade/pages/stacker-game/stacker-game').then((m) => m.StackerGame),
      },
      {
        path: 'pausenraum/laeufer',
        loadComponent: () => import('./arcade/pages/runner-game/runner-game').then((m) => m.RunnerGame),
      },
      {
        path: 'pausenraum/bugjagd',
        loadComponent: () => import('./arcade/pages/bug-hunt-game/bug-hunt-game').then((m) => m.BugHuntGame),
      },
      {
        path: ':room/:thing',
        canMatch: [isThing],
        loadComponent: () =>
          import('./sheets/placeholder-sheet/placeholder-sheet').then((m) => m.PlaceholderSheet),
      },
      {
        path: ':room',
        canMatch: [isRoom],
        loadComponent: () => import('./house/room-panel/room-panel').then((m) => m.RoomPanel),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
