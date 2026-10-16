// Copies pdf.js's worker next to the static site so the viewer can load it from /pdf.worker.min.mjs.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
mkdirSync('public', { recursive: true });
copyFileSync(src, path.join('public', 'pdf.worker.min.mjs'));
