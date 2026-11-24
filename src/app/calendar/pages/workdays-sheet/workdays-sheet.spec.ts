import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { WorkdaysSheet } from './workdays-sheet';

const KEY = 'base:kalender/urlaub.json';
const kept = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');

async function render(vacations: { from: string; to: string }[] = []) {
  if (vacations.length > 0) localStorage.setItem(KEY, JSON.stringify({ vacations }));
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(WorkdaysSheet);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((done) => setTimeout(done));
  await fixture.whenStable();
}

function type(root: HTMLElement, text: string): void {
  const field = root.querySelector<HTMLInputElement>('input.gm-slot')!;
  field.value = text;
  field.dispatchEvent(new Event('input'));
}

const rows = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('.gm-rows .gm-label')).map((label) => label.textContent?.trim());

describe('WorkdaysSheet', () => {
  afterEach(() => localStorage.clear());

  it('shows the workdays of quarter and year and the next holiday', async () => {
    const root = (await render()).nativeElement as HTMLElement;

    expect(root.querySelectorAll('.ws-period')).toHaveLength(2);
    expect(root.querySelector('.gm-banner-title')?.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(root.querySelector('.gm-empty')?.textContent).toContain('Noch kein Urlaub');
  });

  it('enters a typed span into the data folder and lists it', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;

    type(root, '21.12.2099 - 6.1.2100');
    await fixture.whenStable();
    expect(root.querySelector('.ws-preview')?.getAttribute('data-tone')).toBe('ok');

    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);

    expect(kept()).toEqual({ vacations: [{ from: '2099-12-21', to: '2100-01-06' }] });
    expect(rows(root)).toEqual(['21.12.2099 - 06.01.2100']);
    expect(root.querySelector<HTMLInputElement>('input.gm-slot')!.value).toBe('');
  });

  it('says why a span cannot be read and keeps nothing', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;

    type(root, '31.2.2099');
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);

    expect(root.querySelector('.ws-preview')?.getAttribute('data-tone')).toBe('warning');
    expect(root.querySelector('.ws-preview')?.textContent).toContain('"31.2.2099" ist kein Tag');
    expect(kept()).toBeNull();
  });

  it('changes a vacation in place after Enter on it', async () => {
    const fixture = await render([{ from: '2099-07-06', to: '2099-07-17' }]);
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('.gm-row-main')!.click();
    await fixture.whenStable();
    expect(root.querySelector<HTMLInputElement>('input.gm-slot')!.value).toBe('06.07.2099 - 17.07.2099');

    type(root, '06.07.2099 - 24.07.2099');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);

    expect(kept()).toEqual({ vacations: [{ from: '2099-07-06', to: '2099-07-24' }] });
  });

  it('removes a vacation with the key of its row', async () => {
    const fixture = await render([
      { from: '2099-07-06', to: '2099-07-17' },
      { from: '2099-12-21', to: '2099-12-23' },
    ]);
    const root = fixture.nativeElement as HTMLElement;

    root.querySelector<HTMLButtonElement>('[data-row-key="x"]')!.click();
    await settle(fixture);

    expect(kept()).toEqual({ vacations: [{ from: '2099-12-21', to: '2099-12-23' }] });
    expect(rows(root)).toEqual(['21.12.2099 - 23.12.2099']);
  });
});
