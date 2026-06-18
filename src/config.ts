import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

export const KNOWN_LAYERS = ['microsoft', 'community', 'custom'] as const;
export type Layer = (typeof KNOWN_LAYERS)[number];

const ConfigSchema = z.object({
  repoPath: z.string().optional(),
  repoUrl: z.string().url().default('https://github.com/microsoft/BCQuality.git'),
  cachePath: z.string(),
  layers: z.array(z.enum(KNOWN_LAYERS)).min(1),
  autoClone: z.boolean(),
});

export type Config = z.infer<typeof ConfigSchema>;

function defaultCachePath(): string {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'bcquality', 'cache');
  }
  const xdg = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
  return path.join(xdg, 'bcquality');
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseLayers(value: string | undefined): Layer[] {
  if (!value) return [...KNOWN_LAYERS];
  const parsed = value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Layer => (KNOWN_LAYERS as readonly string[]).includes(s));
  return parsed.length > 0 ? parsed : [...KNOWN_LAYERS];
}

export function loadConfig(): Config {
  return ConfigSchema.parse({
    repoPath: process.env.BCQUALITY_REPO_PATH,
    repoUrl: process.env.BCQUALITY_REPO_URL ?? 'https://github.com/microsoft/BCQuality.git',
    cachePath: process.env.BCQUALITY_CACHE_PATH ?? defaultCachePath(),
    layers: parseLayers(process.env.BCQUALITY_LAYERS),
    autoClone: parseBool(process.env.BCQUALITY_AUTO_CLONE, true),
  });
}
