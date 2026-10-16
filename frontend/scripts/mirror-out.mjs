// Next's static export lands in out/. Render's dashboard may still publish dist/ (the old Vite
// folder) if the service isn't synced from render.yaml, so mirror the export there too.
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
cpSync('out', 'dist', { recursive: true });
