/** Twice as fine as on screen: sharp on a Retina display and when Teams shows it larger. */
const SCALE = 2;

/** A whole SVG with its own size onto the clipboard as a PNG. Call it right in the click or key press. */
export function copySvgAsPng(svg: string): Promise<void> {
  // The picture goes in still unpainted: WebKit takes a write only while the key press is fresh.
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png(svg) })]);
}

async function png(svg: string): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth * SCALE;
  canvas.height = image.naturalHeight * SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Kein Bild möglich');
  context.scale(SCALE, SCALE);
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Kein Bild möglich'))), 'image/png'),
  );
}
