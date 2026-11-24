import { describe, expect, it } from 'vitest';

import { readLogo } from './logo';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('readLogo', () => {
  it('keeps the shapes and their geometry, without colors, styles, scripts or handlers', () => {
    const logo = readLogo(
      `<svg ${NS} viewBox="0 0 20 10"><style>.st0{fill:#fff}</style><script>alert(1)</script>` +
        `<g class="a" transform="translate(1 2)"><path class="st0" fill="#f00" onclick="x()" d="M0 0h10v10z"/></g></svg>`,
    );

    expect(logo).toEqual({
      viewBox: '0 0 20 10',
      width: 20,
      height: 10,
      body: '<g transform="translate(1 2)"><path d="M0 0h10v10z"/></g>',
    });
  });

  it('reads the drawing of an Illustrator export and leaves its editing data behind', () => {
    const logo = readLogo(
      `<?xml version="1.0"?><svg ${NS} xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/" viewBox="0 0 1296 343">` +
        '<metadata><x>meta</x></metadata>' +
        '<switch><foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/"><i:pgfRef/></foreignObject>' +
        '<g i:extraneous="self"><path d="M1 1h5"/></g></switch><i:pgf id="pgf">data</i:pgf></svg>',
    );

    expect(logo?.body).toBe('<g><g><path d="M1 1h5"/></g></g>');
    expect(logo?.width).toBe(1296);
  });

  it('has none for an empty or broken file, one without a viewBox and one without shapes', () => {
    expect(readLogo('')).toBeNull();
    expect(readLogo('<svg')).toBeNull();
    expect(readLogo(`<svg ${NS}><path d="M0 0"/></svg>`)).toBeNull();
    expect(readLogo(`<svg ${NS} viewBox="0 0 10 10"><text>LOGO</text></svg>`)).toBeNull();
    expect(readLogo('<html><body/></html>')).toBeNull();
  });
});
