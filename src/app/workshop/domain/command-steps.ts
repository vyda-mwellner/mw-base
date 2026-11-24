import type { DevServer, DevServerPhase } from '../model/dev-server';
import type { Stack } from '../model/docker';
import type { Command } from './command-parser';
import { isRunning } from './stack-rows';

const START_NOTES: Partial<Record<DevServerPhase, string>> = {
  starting: 'baut schon',
  running: 'läuft schon',
  external: 'läuft schon außerhalb',
};
const STOP_NOTES: Partial<Record<DevServerPhase, string>> = {
  off: 'läuft nicht',
  ended: 'läuft nicht',
  external: 'läuft außerhalb, bleibt an',
};

interface CommandStep {
  readonly verb: string;
  readonly names: string;
}

const withNote = (name: string, note: string | undefined): string => (note ? `${name} (${note})` : name);

/** What a command would do, step by step, with what of it is already so. */
export function commandSteps(
  command: Command,
  servers: readonly DevServer[],
  stacks: readonly Stack[],
): CommandStep[] {
  const serverById = new Map(servers.map((server) => [server.id, server]));
  const serverNames = (ids: readonly string[], notes: Partial<Record<DevServerPhase, string>>) =>
    ids.flatMap((id) => {
      const server = serverById.get(id);
      return server ? [withNote(server.label, notes[server.phase])] : [];
    });
  const running = (name: string) =>
    stacks.find((stack) => stack.name === name)?.containers.some(isRunning) ?? false;
  return [
    { verb: 'Starten', names: serverNames(command.servers.start, START_NOTES) },
    { verb: 'Stoppen', names: serverNames(command.servers.stop, STOP_NOTES) },
    {
      verb: 'Container starten',
      names: command.stacks.up.map((name) => withNote(name, running(name) ? 'läuft schon' : undefined)),
    },
    {
      verb: 'Container stoppen',
      names: command.stacks.down.map((name) => withNote(name, running(name) ? undefined : 'läuft nicht')),
    },
  ]
    .filter((step) => step.names.length > 0)
    .map((step) => ({ verb: step.verb, names: step.names.join(', ') }));
}
