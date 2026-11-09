// Font loading (spec §2.1): FontFace from ?inline base64 data URLs so dist-single stays one file.
import lilita from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?inline';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?inline';

let loading: Promise<void> | null = null;

/**
 * Resolves when both faces are loaded, or after timeoutMs (then the fallbacks show). Never rejects: a face that
 * fails to load (blocked data: URL, no FontFace API in an old WebView) used to reject boot() before the game was
 * created, leaving the loading screen up for good.
 */
export function loadFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document !== 'undefined' && typeof CSS !== 'undefined' && !CSS.supports('paint-order', 'stroke fill')) {
    document.documentElement.classList.add('no-po');
  }
  if (!loading) {
    loading = (async () => {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
      const faces = [
        new FontFace('Lilita One', `url(${lilita}) format('woff2')`, { weight: '400' }),
        new FontFace('Fredoka', `url(${fredoka600}) format('woff2')`, { weight: '600' }),
      ];
      await Promise.all(
        faces.map(async (f) => {
          try {
            await f.load();
            document.fonts.add(f);
          } catch (err) {
            console.warn('Font failed to load, using the fallback', err);
          }
        }),
      );
    })().catch(() => undefined);
  }
  return Promise.race([loading, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
