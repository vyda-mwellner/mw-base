/** Where the sky stands at a moment: `light` is 0 at night and 1 by day, the bodies are null below the horizon. */
export interface Sky {
  readonly light: number;
  /** How far along its way from east to west a body is, 0 to 1. */
  readonly sun: number | null;
  readonly moon: number | null;
}

/** What the weather does to the picture. */
export interface Outside {
  /** Share of the sky covered, 0 to 1. */
  readonly cloud: number;
  readonly falling: 'rain' | 'snow' | null;
  /** Whole degrees Celsius. */
  readonly temperature: number;
}

/** Stuttgart - close enough for every place this runs at. */
const LATITUDE = 48.8;
const LONGITUDE = 9.2;
/** Hours before and after sunrise and sunset in which the sky is neither dark nor light. */
const TWILIGHT = 0.7;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Sunrise and sunset as hours on the clock the date was read from, good to a quarter of an hour. */
export function sunTimes(date: Date): { readonly rise: number; readonly set: number } {
  const day = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
  const declination = -23.44 * Math.cos(radians((360 / 365) * (day + 10)));
  const halfDay =
    (Math.acos(-Math.tan(radians(LATITUDE)) * Math.tan(radians(declination))) * 180) / Math.PI / 15;
  const noon = 12 - LONGITUDE / 15 - date.getTimezoneOffset() / 60;
  return { rise: noon - halfDay, set: noon + halfDay };
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export function skyAt(date: Date): Sky {
  const { rise, set } = sunTimes(date);
  const hour = date.getHours() + date.getMinutes() / 60;
  const light = clamp(Math.min(hour - rise, set - hour) / (2 * TWILIGHT) + 0.5);
  const day = hour >= rise && hour <= set;
  const night = 24 - (set - rise);
  return {
    light,
    sun: day ? (hour - rise) / (set - rise) : null,
    moon: day ? null : ((hour - set + 24) % 24) / night,
  };
}

/** Between two colours `#rrggbb`, 0 is the first and 1 the second. */
export function blend(from: string, to: string, share: number): string {
  const channel = (at: number): string =>
    Math.round(
      parseInt(from.slice(at, at + 2), 16) * (1 - share) + parseInt(to.slice(at, at + 2), 16) * share,
    )
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
