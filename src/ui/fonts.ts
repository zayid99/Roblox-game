// Font loading (spec §2.1): FontFace from ?inline base64 data URLs so dist-single stays one file.
import lilita from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?inline';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?inline';

let loading: Promise<void> | null = null;

/** Resolves when both faces are loaded, or after timeoutMs (then the fallbacks show). */
export function loadFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document !== 'undefined' && typeof CSS !== 'undefined' && !CSS.supports('paint-order', 'stroke fill')) {
    document.documentElement.classList.add('no-po');
  }
  if (!loading) {
    const faces = [
      new FontFace('Lilita One', `url(${lilita}) format('woff2')`, { weight: '400' }),
      new FontFace('Fredoka', `url(${fredoka600}) format('woff2')`, { weight: '600' }),
    ];
    loading = Promise.all(
      faces.map(async (f) => {
        await f.load();
        document.fonts.add(f);
      }),
    ).then(() => undefined);
  }
  return Promise.race([loading, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
