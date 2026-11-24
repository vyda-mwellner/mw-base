import { Injectable } from '@angular/core';

import type { Coordinates, CurrentWeather } from '../domain/weather';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/**
 * Open-Meteo needs no key and allows any origin, so the webview asks it itself.
 * Its host is allowed in the CSP of `tauri.conf.json`.
 */
@Injectable({ providedIn: 'root' })
export class WeatherApi {
  async current({ latitude, longitude }: Coordinates): Promise<CurrentWeather> {
    const query = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,cloud_cover,weather_code',
    });
    const response = await fetch(`${FORECAST}?${query}`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Open-Meteo antwortet mit ${response.status}`);
    return ((await response.json()) as { current: CurrentWeather }).current;
  }
}
