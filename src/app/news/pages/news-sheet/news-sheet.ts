import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HouseStatus } from '../../../house/state/house-status';
import { securityNote } from '../../domain/advisories';
import { jokeOf } from '../../domain/jokes';
import { releasesNote } from '../../domain/releases';
import { ReleasesState } from '../../state/releases-state';
import { SecurityState } from '../../state/security-state';

/** The news in the entrance: today's joke, the advisories of the BSI, the releases of the stack. */
@Component({
  imports: [RouterLink],
  templateUrl: './news-sheet.html',
  styleUrl: './news-sheet.scss',
})
export class NewsSheet {
  private readonly status = inject(HouseStatus);
  private readonly releases = inject(ReleasesState);
  private readonly security = inject(SecurityState);

  protected readonly entries = computed(() => [
    {
      path: 'witz',
      label: 'Witz des Tages',
      note: { text: jokeOf(this.status.today()).split('\n')[0], tone: null },
    },
    {
      path: 'security',
      label: 'Security-News',
      note: securityNote(
        this.security.fresh(),
        this.security.visitedOn(this.status.today()),
        this.security.error(),
      ),
    },
    {
      path: 'stack-kurier',
      label: 'Stack-Kurier',
      note: releasesNote(this.releases.issues(), this.releases.error()),
    },
  ]);
}
