import type { Outside } from '../../engine/sky';

/** What Open-Meteo answers for `current=temperature_2m,cloud_cover,weather_code`. */
export interface CurrentWeather {
  readonly temperature_2m: number;
  readonly cloud_cover: number;
  readonly weather_code: number;
}

/** Where the weather is read for, from `einstellungen/ort.json`. */
export interface WeatherPlace {
  readonly name?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** WMO codes: snow and snow showers fall as snow; drizzle, rain, showers and thunderstorms as rain. */
function falling(code: number): Outside['falling'] {
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
  return null;
}

export function outsideOf(current: CurrentWeather): Outside {
  return {
    cloud: Math.max(0, Math.min(1, current.cloud_cover / 100)),
    falling: falling(current.weather_code),
    temperature: Math.round(current.temperature_2m),
  };
}

/** A place without both numbers reads no weather. */
export function coordinatesOf(place: WeatherPlace | null): Coordinates | undefined {
  const { latitude, longitude } = place ?? {};
  return typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : undefined;
}
