import { TestBed } from '@angular/core/testing';

import { Workbench } from '../../workbench';
import { PictureView } from './picture-view';

/** Stands in for the browser's ClipboardItem, which jsdom lacks, and keeps what it was given. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Promise<Blob>>) {}
}

describe('PictureView', () => {
  // jsdom paints nothing: the picture is never finished, only handed over.
  const write = vi.fn(async (items: FakeClipboardItem[]) => {
    for (const item of items) for (const blob of Object.values(item.items)) await blob.catch(() => undefined);
  });

  async function open(): Promise<HTMLElement> {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
    const fixture = TestBed.createComponent(PictureView);
    await TestBed.inject(Workbench).picture(
      'Landkarte',
      '<svg width="10" height="10"><text>Shop</text></svg>',
    );
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    write.mockClear();
    vi.unstubAllGlobals();
  });

  it('lays the drawing on the desk', async () => {
    const root = await open();

    expect(root.querySelector('.wb-picture svg text')?.textContent).toBe('Shop');
  });

  it('puts it on the clipboard as a PNG with Q', async () => {
    await open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));

    expect(write).toHaveBeenCalledWith([new FakeClipboardItem({ 'image/png': expect.any(Promise) })]);
  });

  it('leaves Q with Command to the system', async () => {
    await open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', metaKey: true }));

    expect(write).not.toHaveBeenCalled();
  });
});
