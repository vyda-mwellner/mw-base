import type { Note } from '../../engine/model';
import type { SetupCommand, Stack } from '../model/docker';
import { DOING, isBroken, isRunning } from './stack-rows';

interface DockerInput {
  /** Null until docker answered once. */
  readonly stacks: readonly Stack[] | null;
  /** Docker does not answer, or local-setup is missing. */
  readonly error: string | null;
  readonly busy: SetupCommand | null;
}

/** What the container stack in the workshop shows of the stacks of local-setup. */
interface DockerView {
  /** A container per stack, true while something of it runs. */
  readonly live: boolean[];
  readonly alarm: boolean;
  readonly note: Note;
  /** What the island says while a setup run goes on, also with the sheet closed. */
  readonly activity: string | null;
}

export function dockerView({ stacks, error, busy }: DockerInput): DockerView {
  const activity = busy ? `Setup: ${busy.stack} ${DOING[busy.kind]}` : null;
  if (error !== null)
    return { live: [], alarm: true, note: { text: `Docker: ${error}`, tone: 'danger' }, activity };
  if (stacks === null)
    return { live: [], alarm: false, note: { text: 'Wird gelesen', tone: null }, activity };

  const live = stacks.map((stack) => stack.containers.some(isRunning));
  const running = stacks.filter((_, index) => live[index]).map((stack) => stack.name);
  const broken = stacks.some((stack) => stack.containers.some(isBroken));
  const text = activity
    ? activity
    : running.length === 0
      ? 'Kein Stack läuft'
      : `${running.length} von ${stacks.length} Stacks laufen: ${running.join(', ')}`;
  return { live, alarm: false, note: { text, tone: broken ? 'warning' : null }, activity };
}
