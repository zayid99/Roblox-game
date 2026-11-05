import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works when uploaded to CrazyGames (or any sub-folder).
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    // Inline every imported asset (fonts) so dist-single stays one file.
    assetsInlineLimit: 100_000_000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
