import { describe, expect, it } from 'vitest';
import { CommandContext, parseCommand } from './command-parser';

const context: CommandContext = {
  servers: [
    { id: 'dashboard', label: 'Dashboard', repo: 'pos-gui' },
    { id: 'pt-classification', label: 'PT1 Klassifizierung', repo: 'pos-gui' },
    { id: 'pt-extraction', label: 'PT2 Erfassung', repo: 'pos-gui' },
    { id: 'registrierung', label: 'Registrierung', repo: 'pos-gui' },
    { id: 'billing-gui', label: 'billing-gui', repo: 'billing-gui' },
    { id: 'helpdesk-gui', label: 'helpdesk-gui', repo: 'helpdesk-gui' },
    { id: 'order-gui', label: 'order-gui', repo: 'order-gui' },
    { id: 'eta-gui', label: 'eta-gui', repo: 'eta-gui' },
  ],
  favorites: ['dashboard', 'pt-classification', 'pt-extraction', 'billing-gui'],
  stacks: [
    { name: 'db', defaultStack: true },
    { name: 'keycloak', defaultStack: true },
    { name: 'mail', defaultStack: false },
    { name: 'ocr', defaultStack: false },
    { name: 'pdf', defaultStack: true },
    { name: 'storage', defaultStack: true },
  ],
};

const parse = (text: string) => parseCommand(text, context);
const servers = (text: string) => parse(text).servers;
const stacks = (text: string) => parse(text).stacks;

describe('parseCommand', () => {
  it('starts the apps it names, however speech-to-text spells them', () => {
    expect(parse('Starte bitte billinggui und ordergui.')).toEqual({
      servers: { start: ['billing-gui', 'order-gui'], stop: [] },
      stacks: { up: [], down: [] },
      unknown: [],
      verbMissing: false,
    });
    expect(servers('starte Billing GUI und order-gui').start).toEqual(['billing-gui', 'order-gui']);
    expect(servers('start billing and order').start).toEqual(['billing-gui', 'order-gui']);
  });

  it('takes the favorites of a repo with several apps', () => {
    expect(servers('starte alle apps in pos-gui').start).toEqual([
      'dashboard',
      'pt-classification',
      'pt-extraction',
    ]);
    expect(servers('starte POS GUI').start).toEqual(['dashboard', 'pt-classification', 'pt-extraction']);
    expect(parseCommand('starte pos-gui', { ...context, favorites: [] }).servers.start).toEqual([
      'dashboard',
      'pt-classification',
      'pt-extraction',
      'registrierung',
    ]);
  });

  it('knows the apps of pos-gui by their own words and spoken numbers', () => {
    expect(servers('starte dashboard und pt eins').start).toEqual(['dashboard', 'pt-classification']);
    expect(servers('starte die Erfassung und die Registrierung').start).toEqual([
      'pt-extraction',
      'registrierung',
    ]);
  });

  it('means the favorites by "alles" when starting and every server when stopping', () => {
    expect(parse('starte alles')).toMatchObject({
      servers: { start: context.favorites },
      stacks: { up: [] },
    });
    expect(servers('stoppe alle').stop).toEqual(context.servers.map((server) => server.id));
  });

  it('starts and stops in one sentence, with the verb before or after the apps', () => {
    expect(servers('stoppe order-gui und starte helpdesk')).toEqual({
      start: ['helpdesk-gui'],
      stop: ['order-gui'],
    });
    expect(servers('billing gui starten und eta gui beenden')).toEqual({
      start: ['billing-gui'],
      stop: ['eta-gui'],
    });
  });

  it('forgives a misheard long name, not a short one or one two apps come close to', () => {
    expect(servers('starte odergui').start).toEqual(['order-gui']);
    expect(servers('starte dashbord').start).toEqual(['dashboard']);
    expect(parse('starte eto')).toMatchObject({ servers: { start: [] }, unknown: ['eto'] });
  });

  it('finds a name speech-to-text spelled the way it sounds in German', () => {
    expect(parse('Statte alle Poskuis.')).toMatchObject({
      servers: { start: ['dashboard', 'pt-classification', 'pt-extraction'] },
      unknown: [],
    });
    expect(servers('starte pus gui').start).toEqual(['dashboard', 'pt-classification', 'pt-extraction']);
  });

  it('does nothing without a verb and names the words it did not get', () => {
    expect(parse('billing-gui und order-gui')).toMatchObject({
      servers: { start: [], stop: [] },
      verbMissing: true,
    });
    expect(parse('starte billing und notary')).toMatchObject({
      servers: { start: ['billing-gui'] },
      unknown: ['notary'],
    });
    expect(parse('mail container')).toMatchObject({ stacks: { up: [], down: [] }, verbMissing: true });
    expect(parse('')).toMatchObject({ unknown: [], verbMissing: false });
  });

  it('starts and stops stacks of local-setup one by one, by name', () => {
    expect(stacks('starte mail container')).toEqual({ up: ['mail'], down: [] });
    expect(stacks('starte den Keycloak und die DB')).toEqual({ up: ['db', 'keycloak'], down: [] });
    expect(stacks('stoppe den OCR Container und den Mail Stack')).toEqual({ up: [], down: ['mail', 'ocr'] });
  });

  it('means the default stacks by "default" and by "alle container" when starting, every stack when stopping', () => {
    expect(stacks('starte default container')).toEqual({
      up: ['db', 'keycloak', 'pdf', 'storage'],
      down: [],
    });
    expect(stacks('starte die Standard Container und mail')).toEqual({
      up: ['db', 'keycloak', 'mail', 'pdf', 'storage'],
      down: [],
    });
    expect(stacks('starte alle container').up).toEqual(['db', 'keycloak', 'pdf', 'storage']);
    expect(parse('stoppe alle container')).toMatchObject({
      servers: { stop: [] },
      stacks: { down: ['db', 'keycloak', 'mail', 'ocr', 'pdf', 'storage'] },
    });
  });

  it('starts containers and dev servers in one sentence', () => {
    expect(parse('starte default container und alle apps in pos-gui')).toMatchObject({
      servers: { start: ['dashboard', 'pt-classification', 'pt-extraction'] },
      stacks: { up: ['db', 'keycloak', 'pdf', 'storage'] },
    });
  });

  it('knows no container words while local-setup is missing', () => {
    expect(parseCommand('starte default container', { ...context, stacks: [] })).toMatchObject({
      stacks: { up: [] },
      unknown: ['default'],
    });
  });
});
