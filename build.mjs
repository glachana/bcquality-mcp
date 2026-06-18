// Build via esbuild — transpile TS → JS sans type-check.
// Le type-check séparé est dans `npm run typecheck`.
// (Le couple SDK MCP 1.29 + Zod 3.25 fait exploser l'inférence de tsc en heap.)

import { build } from 'esbuild';
import { readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'dist');

function collectTs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const entryPoints = collectTs(srcDir);

await build({
  entryPoints,
  outdir: outDir,
  outbase: srcDir,
  bundle: false,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  sourcemap: false,
  logLevel: 'info',
});

console.log(`✓ Built ${entryPoints.length} files → ${path.relative(__dirname, outDir)}/`);
