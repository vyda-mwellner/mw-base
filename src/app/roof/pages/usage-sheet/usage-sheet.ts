import { Component, computed, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { injectSheetKeys } from '../../../ui/sheet-keys';
import { chartSvg } from '../../../workbench/domain/charts';
import { costChart, modelRows, usageFigures, WINDOW_DAYS } from '../../domain/usage';
import { UsageState } from '../../state/usage-state';

/** The meter in the attic: what Claude Code cost today, this month and per day over the last 30 days. */
@Component({
  templateUrl: './usage-sheet.html',
  styleUrl: './usage-sheet.scss',
})
export class UsageSheet {
  private readonly usage = inject(UsageState);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly windowDays = WINDOW_DAYS;
  protected readonly error = this.usage.error;
  protected readonly loading = this.usage.loading;
  protected readonly figures = computed(() => {
    const days = this.usage.days();
    if (!days) return [];
    const figures = usageFigures(days, new Date());
    return [
      { label: 'Heute', value: figures.today },
      { label: 'Monat', value: figures.month },
      { label: `${WINDOW_DAYS} Tage`, value: figures.window },
      { label: 'Schnitt pro Tag', value: figures.perDay },
      {
        label: figures.peakDay ? `Höchste pro Tag · ${figures.peakDay}` : 'Höchste pro Tag',
        value: figures.peak,
      },
      { label: 'Genutzte Tage', value: figures.used },
    ];
  });
  protected readonly tokens = computed(() => {
    const days = this.usage.days();
    return days ? usageFigures(days, new Date()).tokens : '';
  });
  // An SVG the app drew itself from numbers; the sanitizer would drop it.
  protected readonly chart = computed(() => {
    const days = this.usage.days();
    return days
      ? this.sanitizer.bypassSecurityTrustHtml(chartSvg('bar', costChart(days, new Date()), 'Kosten pro Tag'))
      : null;
  });
  protected readonly models = computed(() => modelRows(this.usage.days() ?? []));

  constructor() {
    this.usage.reload();
    injectSheetKeys(() => [{ keys: ['Q'], label: 'Neu lesen' }]);
  }

  protected reload(): void {
    this.usage.reload();
  }
}
