import {
  hoursWorked,
  periods,
  type Vacation,
  WORKDAY_HOURS,
  WORKDAY_START,
  workdaysBetween,
} from '../../calendar/domain/calendar';
import { NUMBER, plural } from '../../core/format';
import { addDays, localIso, toDate } from '../../engine/days';
import { type MovementDay, movementOf, NO_MOVEMENT } from '../../relax/domain/movement';
import { usageFigures } from '../../roof/domain/usage';
import type { UsageDay } from '../../roof/model/usage';

const WEEKDAY = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
});
/** Longer than any vacation, so a next workday is always found. */
const LOOK_AHEAD_DAYS = 60;

interface DayAtWork {
  readonly now: Date;
  readonly movement: MovementDay | undefined;
  /** Null until ccusage answered. */
  readonly usage: readonly UsageDay[] | null;
  readonly vacations: readonly Vacation[];
}

interface DayFact {
  readonly label: string;
  readonly value: string;
}

export interface Farewell {
  readonly facts: readonly DayFact[];
  /** Like `Donnerstag, 26.11.`, null when none lies within reach. */
  readonly nextWorkday: string | null;
  /** Like `Q4 hat danach noch 21 Tage netto.` */
  readonly quarter: string;
}

/** The next day of mine after `today`: Monday to Thursday, no holiday, no vacation. */
export function nextWorkday(today: string, vacations: readonly Vacation[]): string | null {
  for (let day = addDays(today, 1); day <= addDays(today, LOOK_AHEAD_DAYS); day = addDays(day, 1))
    if (workdaysBetween(day, day, vacations).left === 1) return day;
  return null;
}

/** What the day came to and when the next one is, shown at the car before the app closes. */
export function farewell({ now, movement, usage, vacations }: DayAtWork): Farewell {
  const today = localIso(now);
  const { steps, floors } = movementOf(movement ?? NO_MOVEMENT);
  const next = nextWorkday(today, vacations);
  const [quarter] = periods(today, vacations);
  const left = workdaysBetween(addDays(today, 1), quarter.last, vacations).left;
  return {
    facts: [
      {
        label: `Arbeitszeit ab ${WORKDAY_START} Uhr`,
        value: `${hoursWorked(now)} von ${WORKDAY_HOURS} Stunden`,
      },
      { label: 'Claude heute', value: usage ? usageFigures(usage, now).today : 'nicht gelesen' },
      { label: 'Schritte', value: NUMBER.format(steps) },
      { label: 'Etagen', value: NUMBER.format(floors) },
    ],
    nextWorkday: next && WEEKDAY.format(toDate(next)),
    quarter: `${quarter.label} hat danach noch ${plural(left, 'Tag', 'Tage')} netto.`,
  };
}
