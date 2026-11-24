import { computed, inject, Injectable, resource } from '@angular/core';

import { poll } from '../../core/poll';
import { Store } from '../../ui/store';
import { WeatherApi } from '../data/weather-api';
import { coordinatesOf, outsideOf, type WeatherPlace } from '../domain/weather';

const PLACE_PATH = 'einstellungen/ort.json';
const POLL_MS = 30 * 60_000;

/** The weather at the place in the data folder; without a place, or while Open-Meteo is out of reach, the sky stays clear. */
@Injectable({ providedIn: 'root' })
export class Weather {
  private readonly store = inject(Store);
  private readonly api = inject(WeatherApi);
  private readonly place = resource({ loader: () => this.store.read<WeatherPlace>(PLACE_PATH) });
  private readonly current = resource({
    params: () => coordinatesOf(this.place.hasValue() ? this.place.value() : null),
    loader: ({ params }) => this.api.current(params),
  });

  readonly outside = computed(() => (this.current.hasValue() ? outsideOf(this.current.value()) : null));

  constructor() {
    poll(this.current, POLL_MS);
  }
}
