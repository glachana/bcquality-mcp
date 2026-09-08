import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveRepo } from '../../src/repo/manager.js';
import type { Config } from '../../src/config.js';

const UPSTREAM = 'https://github.com/microsoft/BCQuality.git';
const FORK = 'https://github.com/DynamicsInternational/BCQuality.git';

let tmpRoot: string;

/**
 * Builds a directory that passes looksLikeBCQuality() and is a real git repo
 * with the given origin. No commit is needed: readCommit() tolerates an
 * unborn HEAD.
 */
function makeFakeClone(name: string, origin?: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(path.join(dir, 'microsoft', 'knowledge', 'performance'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# fake BCQuality clone\n');
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  if (origin) {
    execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: dir });
  }
  return dir;
}

function config(overrides: Partial<Config>): Config {
  return {
    repoUrl: FORK,
    cachePath: path.join(tmpRoot, 'nonexistent-cache'),
    layers: ['microsoft', 'community', 'custom'],
    autoClone: false,
    ...overrides,
  };
}

describe('resolveRepo — cache remote verification', () => {
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcq-manager-'));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('serves the cache when its origin matches the configured repo URL', async () => {
    const cache = makeFakeClone('match', FORK);
    const info = await resolveRepo(config({ cachePath: cache }));
    expect(info.source).toBe('cache');
    expect(info.path).toBe(cache);
    expect(info.remoteUrl).toBe(FORK);
  });

  it('accepts a cosmetic difference in the origin URL form', async () => {
    const cache = makeFakeClone('match-scp', 'git@github.com:DynamicsInternational/BCQuality.git');
    const info = await resolveRepo(config({ cachePath: cache }));
    expect(info.source).toBe('cache');
  });

  it('refuses a cache cloned from upstream when a fork is configured', async () => {
    const cache = makeFakeClone('diverged', UPSTREAM);
    await expect(resolveRepo(config({ cachePath: cache }))).rejects.toThrow(
      /was cloned from .*microsoft\/BCQuality/,
    );
    // The message must name the configured URL so the fix is obvious.
    await expect(resolveRepo(config({ cachePath: cache }))).rejects.toThrow(
      /BCQUALITY_REPO_URL is .*DynamicsInternational/,
    );
  });

  it('refuses a cache with no origin remote at all', async () => {
    const cache = makeFakeClone('no-origin');
    await expect(resolveRepo(config({ cachePath: cache }))).rejects.toThrow(/no origin remote/);
  });

  it('never second-guesses an explicit BCQUALITY_REPO_PATH, and reports its remote', async () => {
    // Same divergence as above, but requested by path: it must be served as-is.
    const explicit = makeFakeClone('explicit', UPSTREAM);
    const info = await resolveRepo(config({ repoPath: explicit, repoUrl: FORK }));
    expect(info.source).toBe('env');
    expect(info.path).toBe(explicit);
    expect(info.remoteUrl).toBe(UPSTREAM);
  });
});
