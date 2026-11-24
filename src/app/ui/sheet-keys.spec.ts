import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { injectSheetKeys, SheetKeys } from './sheet-keys';

function openSheet(label: string): EnvironmentInjector {
  const sheet = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
  runInInjectionContext(sheet, () => injectSheetKeys(() => [{ keys: ['Q'], label }]));
  return sheet;
}

describe('SheetKeys', () => {
  it('shows the keys of a sheet for as long as it is open', () => {
    const keys = TestBed.inject(SheetKeys);
    const sheet = openSheet('Neu lesen');

    expect(keys.hints()).toEqual([{ keys: ['Q'], label: 'Neu lesen' }]);

    sheet.destroy();

    expect(keys.hints()).toEqual([]);
  });

  it('keeps the keys of the next sheet when the one before goes after it came', () => {
    const keys = TestBed.inject(SheetKeys);
    const before = openSheet('Neu lesen');
    openSheet('Neu drucken');

    before.destroy();

    expect(keys.hints()).toEqual([{ keys: ['Q'], label: 'Neu drucken' }]);
  });
});
