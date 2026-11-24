import { describe, expect, it } from 'vitest';

import type { Container, Stack } from '../model/docker';
import { dockerView } from './house-view';

const running: Container = { id: 'a', name: 'a', image: 'i', state: 'running', status: 'Up', ports: '' };
const stack = (name: string, containers: Container[] = []): Stack => ({
  name,
  defaultStack: false,
  containers,
});

describe('dockerView', () => {
  it('lights a container per running stack and names them', () => {
    const view = dockerView({ stacks: [stack('db', [running]), stack('mail')], error: null, busy: null });

    expect(view.live).toEqual([true, false]);
    expect(view.note).toEqual({ text: '1 von 2 Stacks laufen: db', tone: null });
    expect(view.activity).toBeNull();
  });

  it('turns every lamp of the container stack red when docker does not answer', () => {
    const view = dockerView({ stacks: null, error: 'docker ps antwortet nicht', busy: null });

    expect(view.alarm).toBe(true);
    expect(view.note.tone).toBe('danger');
  });

  it('tells the island about a setup run that goes on', () => {
    const view = dockerView({ stacks: [stack('db')], error: null, busy: { kind: 'down', stack: 'db' } });

    expect(view.activity).toBe('Setup: db wird gestoppt');
    expect(view.note.text).toBe('Setup: db wird gestoppt');
  });
});
