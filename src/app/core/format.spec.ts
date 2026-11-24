import { plural } from './format';

describe('plural', () => {
  it('takes the singular for exactly one and groups thousands the German way', () => {
    expect(plural(1, 'Pod', 'Pods')).toBe('1 Pod');
    expect(plural(0, 'Pod', 'Pods')).toBe('0 Pods');
    expect(plural(1200, 'Eintrag', 'Einträge')).toBe('1.200 Einträge');
  });
});
