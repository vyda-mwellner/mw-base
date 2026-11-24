import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { placeOf } from '../../engine/plan';

/** Where the URL points: the house, a room, or a thing in a room. */
@Injectable({ providedIn: 'root' })
export class Whereabouts {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly place = computed(() => placeOf(this.url()));
}
