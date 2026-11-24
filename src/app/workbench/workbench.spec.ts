import { TestBed } from '@angular/core/testing';

import { Workbench } from './workbench';

describe('Workbench', () => {
  let workbench: Workbench;

  beforeEach(() => (workbench = TestBed.inject(Workbench)));

  it('lays a report open on the desk', async () => {
    await workbench.report('Gebäude', '<p>Tabelle</p>');

    expect(workbench.desk()).toEqual({
      kind: 'report',
      title: 'Gebäude',
      body: '<p>Tabelle</p>',
      actions: {},
      dials: [],
    });
  });

  it('lays a drawing open on the desk', async () => {
    await workbench.picture('Landkarte', '<svg></svg>');

    expect(workbench.desk()).toEqual({ kind: 'picture', title: 'Landkarte', svg: '<svg></svg>' });
  });

  it('puts a tool in the place of the report and away again', async () => {
    await workbench.report('Gebäude', '<p>Tabelle</p>');
    await workbench.tool('markdown');

    expect(workbench.desk()).toEqual({ kind: 'markdown' });

    workbench.close();

    expect(workbench.desk()).toBeNull();
  });
});
