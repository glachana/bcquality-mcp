import fs from 'node:fs';
import path from 'node:path';
import { simpleGit, SimpleGit } from 'simple-git';
import type { Config } from '../config.js';

export interface RepoInfo {
  path: string;
  source: 'env' | 'cache' | 'cloned';
  commit: string;
  headSha: string;
}

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

function looksLikeBCQuality(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'README.md')) &&
    (fs.existsSync(path.join(dir, 'microsoft')) ||
      fs.existsSync(path.join(dir, 'community')) ||
      fs.existsSync(path.join(dir, 'skills')))
  );
}

async function readCommit(git: SimpleGit): Promise<{ commit: string; headSha: string }> {
  try {
    const headSha = (await git.revparse(['HEAD'])).trim();
    const log = await git.log({ maxCount: 1 });
    const commit = log.latest ? `${log.latest.hash.substring(0, 7)} — ${log.latest.message}` : headSha;
    return { commit, headSha };
  } catch {
    return { commit: 'unknown', headSha: 'unknown' };
  }
}

export async function resolveRepo(config: Config): Promise<RepoInfo> {
  // 1. Env path
  if (config.repoPath) {
    const abs = path.resolve(config.repoPath);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `BCQUALITY_REPO_PATH points to "${abs}" which does not exist. ` +
          `Create it, point elsewhere, or unset BCQUALITY_REPO_PATH to use the auto-clone cache.`,
      );
    }
    if (!looksLikeBCQuality(abs)) {
      throw new Error(
        `Directory "${abs}" does not look like a BCQuality clone (missing README.md and layer dirs).`,
      );
    }
    const git = simpleGit(abs);
    const { commit, headSha } = await readCommit(git);
    return { path: abs, source: 'env', commit, headSha };
  }

  // 2. Cache path (existing)
  const cacheAbs = path.resolve(config.cachePath);
  if (isGitRepo(cacheAbs) && looksLikeBCQuality(cacheAbs)) {
    const git = simpleGit(cacheAbs);
    const { commit, headSha } = await readCommit(git);
    return { path: cacheAbs, source: 'cache', commit, headSha };
  }

  // 3. Auto-clone
  if (!config.autoClone) {
    throw new Error(
      `No BCQuality clone found and BCQUALITY_AUTO_CLONE is disabled. ` +
        `Set BCQUALITY_REPO_PATH or enable auto-clone.`,
    );
  }

  fs.mkdirSync(path.dirname(cacheAbs), { recursive: true });
  if (fs.existsSync(cacheAbs)) {
    fs.rmSync(cacheAbs, { recursive: true, force: true });
  }
  const git = simpleGit();
  await git.clone(config.repoUrl, cacheAbs, ['--depth', '1']);
  const cloneGit = simpleGit(cacheAbs);
  const { commit, headSha } = await readCommit(cloneGit);
  return { path: cacheAbs, source: 'cloned', commit, headSha };
}

export async function pullRepo(repoPath: string): Promise<{ before: string; after: string; changedFiles: number }> {
  const git = simpleGit(repoPath);
  const before = (await git.revparse(['HEAD'])).trim();
  const result = await git.pull();
  const after = (await git.revparse(['HEAD'])).trim();
  return {
    before,
    after,
    changedFiles: result.files.length,
  };
}
