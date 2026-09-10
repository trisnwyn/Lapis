import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: [
    'src/background.ts',
    'src/content/injected.ts',
    'src/content/lms.ts',
    'src/content/bridge.ts',
    'src/popup.ts',
  ],
  outbase: 'src',
  bundle: true,
  format: 'iife',
  outdir: 'dist',
  target: ['chrome120'],
  minify: false,
  sourcemap: false,
});

copyFileSync('manifest.json', 'dist/manifest.json');
copyFileSync('popup.html', 'dist/popup.html');
console.log('extension build ok → apps/extension/dist');
