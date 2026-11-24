import { describe, expect, it } from 'vitest';

import type { Container, Stack } from '../model/docker';
import type { ServiceHealth } from '../model/health';
import { looseServices, stackRow } from './stack-rows';

const container = (name: string, state = 'running', status = 'Up 2 hours'): Container => ({
  id: name,
  name,
  image: 'image',
  state,
  status,
  ports: '',
});
const stack = (name: string, ...containers: Container[]): Stack => ({ name, defaultStack: true, containers });
const service = (label: string, health: ServiceHealth['health'], detail = ''): ServiceHealth => ({
  id: label.toLowerCase(),
  label,
  group: 'Infrastruktur',
  kind: 'infra',
  stack: 'keycloak',
  target: 'http://localhost:8081/',
  health,
  detail,
});

describe('stackRow', () => {
  it('shows a stack without containers as not started', () => {
    expect(stackRow(stack('mail'), [], null)).toMatchObject({
      running: false,
      tone: null,
      note: 'nicht gestartet',
      value: '',
    });
  });

  it('counts an init container that exited with 0 as fine', () => {
    const storage = stack(
      'storage',
      container('minio'),
      container('minio-init', 'exited', 'Exited (0) 2 hours ago'),
    );

    expect(stackRow(storage, [], null)).toMatchObject({
      running: true,
      tone: 'ok',
      note: 'läuft',
      value: '2/2',
    });
  });

  it('names the first container that crashed', () => {
    const storage = stack(
      'storage',
      container('minio'),
      container('minio-init', 'exited', 'Exited (1) 1 minute ago'),
    );

    expect(stackRow(storage, [], null)).toMatchObject({
      tone: 'warning',
      note: 'minio-init: Exited (1) 1 minute ago',
      value: '1/2',
    });
  });

  it('says whether the services of the stack answer, and waits for one that is still starting', () => {
    const keycloak = stack('keycloak', container('local-keycloak'));

    expect(stackRow(keycloak, [service('Keycloak', 'up')], null).note).toBe('läuft · Keycloak antwortet');
    expect(stackRow(keycloak, [service('Keycloak', 'off')], null)).toMatchObject({
      tone: 'warning',
      note: 'Keycloak antwortet noch nicht',
    });
    expect(stackRow(keycloak, [service('Keycloak', 'down', 'DOWN (HTTP 503)')], null)).toMatchObject({
      tone: 'danger',
      note: 'Keycloak: DOWN (HTTP 503)',
    });
  });

  it('shows the stack a setup run works on as busy, whatever its containers say', () => {
    expect(stackRow(stack('db'), [], { kind: 'up', stack: 'db' })).toMatchObject({
      tone: 'busy',
      note: 'wird gestartet',
    });
    expect(stackRow(stack('db'), [], { kind: 'up', stack: 'mail' }).tone).toBeNull();
  });
});

describe('looseServices', () => {
  it('keeps the infrastructure without a stack and leaves out the apps of the workspace', () => {
    const services: ServiceHealth[] = [
      { ...service('Keycloak', 'up') },
      { ...service('Tabellen', 'off'), stack: null, kind: 'service' },
      { ...service('ps-server', 'up'), stack: null, kind: 'backend' },
    ];

    expect(looseServices(services).map((each) => each.label)).toEqual(['Tabellen']);
  });
});
