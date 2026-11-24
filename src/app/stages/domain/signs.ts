import { MOMENT } from '../../core/format';
import { Env, ENV_LABELS, ENVS } from '../model/env';
import { Incidents } from '../model/cluster';

const DAY = 24 * 60 * 60 * 1000;

export type SignTone = 'calm' | 'fresh' | 'unread';

export interface Sign {
  env: Env;
  label: string;
  days: string;
  text: string;
  tone: SignTone;
  title: string;
}

/** One sign per env, counting from the newest restart or, without one, from the first look at the env. */
export function incidentSigns(incidents: Incidents, now: number): Sign[] {
  return ENVS.map((env) => {
    const label = ENV_LABELS[env];
    const record = incidents[env];
    if (!record) {
      return {
        env,
        label,
        days: '-',
        text: 'noch nicht gelesen',
        tone: 'unread',
        title: `${label} wurde noch nicht gelesen - einmal auswählen, dann zählt das Schild`,
      };
    }
    const from = record.last?.at ?? record.watchedSince;
    const days = Math.max(0, Math.floor((now - from) / DAY));
    return {
      env,
      label,
      days: String(days),
      text: days === 1 ? 'Tag ohne Vorfall' : 'Tage ohne Vorfall',
      tone: days === 0 && record.last ? 'fresh' : 'calm',
      title: record.last
        ? `Zuletzt ${record.last.reason} in ${record.last.app} am ${MOMENT.format(record.last.at)}. Ein Vorfall ist jeder Container-Neustart, den die Übersicht sieht.`
        : `Kein Neustart gesehen, seit ${label} am ${MOMENT.format(record.watchedSince)} zum ersten Mal gelesen wurde`,
    };
  });
}
