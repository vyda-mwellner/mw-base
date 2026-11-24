/** For every value that goes into the HTML of a report. */
export const escapeHtml = (value: string | number): string =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const section = (title: string, body: string): string =>
  `<section class="wb-section"><h2>${escapeHtml(title)}</h2>${body}</section>`;

/** `rows` are finished `<tr>` lines; a numeric column is set right like figures in a ledger. */
export const table = (
  head: readonly string[],
  rows: readonly string[],
  numeric: readonly boolean[] = [],
): string =>
  [
    '<div class="wb-table-wrap"><table class="wb-table">',
    `<thead><tr>${head.map((name, index) => `<th scope="col"${numeric[index] ? ' class="wb-num"' : ''}>${escapeHtml(name)}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows.join('')}</tbody>`,
    '</table></div>',
  ].join('');
