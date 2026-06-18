import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface PkgInfo {
  name: string;
  version: string;
}

function loadPkg(): PkgInfo {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', 'package.json'),
    path.resolve(here, '..', '..', 'package.json'),
  ];
  for (const c of candidates) {
    try {
      const raw = readFileSync(c, 'utf8');
      const json = JSON.parse(raw) as { name?: string; version?: string };
      if (json.name && json.version) {
        return { name: json.name, version: json.version };
      }
    } catch {
      // try next candidate
    }
  }
  return { name: 'bcquality-mcp', version: '0.0.0-unknown' };
}

export const PKG: PkgInfo = loadPkg();
