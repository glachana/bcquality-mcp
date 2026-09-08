import fs from 'node:fs';
import path from 'node:path';
import { simpleGit, SimpleGit } from 'simple-git';
import type { Config } from '../config.js';

export interface RepoInfo {
  path: string;
  source: 'env' | 'cache' | 'cloned';
  commit: string;
  headSha: string;
  /** `origin` of the clone being served; undefined when absent or unreadable. */
  remoteUrl?: string;
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

/**
 * Normalizes a git remote URL for comparison. Handles the scp form
 * (`git@host:org/repo`), a `git+` prefix, embedded credentials, a trailing
 * `.git` and trailing slashes. Case is folded: a false negative is preferable
 * to a re-clone triggered by nothing but a difference in casing.
 */
export function normalizeGitUrl(url: string): string {
  let out = url.trim();
  if (!out) return '';
  out = out.replace(/^git\+/, '');
  // scp form: git@github.com:org/repo.git -> github.com/org/repo.git
  const scp = out.match(/^[^/]+@([^:/]+):(.+)$/);
  if (scp) {
    out = `${scp[1]}/${scp[2]}`;
  } else {
    out = out.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    // Strip any embedded credentials: user:token@host/...
    out = out.replace(/^[^/@]+@/, '');
  }
  // Trailing slashes first: ".git/" must reduce to "" and not survive as ".git".
  out = out.replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  return out.toLowerCase();
}

/** Reads `origin` without ever throwing: undefined when absent or unreadable. */
async function readRemoteUrl(git: SimpleGit): Promise<string | undefined> {
  try {
    const url = await git.remote(['get-url', 'origin']);
    const trimmed = typeof url === 'string' ? url.trim() : '';
    return trimmed || undefined;
  } catch {
    return undefined;
  }
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
    // An explicit path is authoritative: report the remote, never second-guess it.
    const remoteUrl = await readRemoteUrl(git);
    return { path: abs, source: 'env', commit, headSha, remoteUrl };
  }

  // 2. Cache path (existing)
  const cacheAbs = path.resolve(config.cachePath);
  let staleCacheRemote: string | undefined;
  if (isGitRepo(cacheAbs) && looksLikeBCQuality(cacheAbs)) {
    const git = simpleGit(cacheAbs);
    const remoteUrl = await readRemoteUrl(git);
    // The cache may have been cloned from a different URL (fork <-> upstream).
    // Serving it anyway would silently drop the configured repo's /custom/ layer
    // with no visible error anywhere.
    const diverged =
      remoteUrl === undefined || normalizeGitUrl(remoteUrl) !== normalizeGitUrl(config.repoUrl);

    if (!diverged) {
      const { commit, headSha } = await readCommit(git);
      return { path: cacheAbs, source: 'cache', commit, headSha, remoteUrl };
    }

    const found = remoteUrl ?? '(no origin remote)';
    if (!config.autoClone) {
      throw new Error(
        `The BCQuality cache at "${cacheAbs}" was cloned from ${found}, ` +
          `but BCQUALITY_REPO_URL is ${config.repoUrl}. Serving it would silently drop the ` +
          `configured repo's layers (typically /custom/). Re-point the cache with ` +
          `\`git -C "${cacheAbs}" remote set-url origin ${config.repoUrl}\`, delete the cache ` +
          `directory, set BCQUALITY_REPO_PATH to the clone you want, or enable BCQUALITY_AUTO_CLONE ` +
          `to let the server re-clone it.`,
      );
    }
    staleCacheRemote = found;
  }

  // 3. Auto-clone
  if (!config.autoClone) {
    throw new Error(
      `No BCQuality clone found and BCQUALITY_AUTO_CLONE is disabled. ` +
        `Set BCQUALITY_REPO_PATH or enable auto-clone.`,
    );
  }

  if (staleCacheRemote) {
    // stdout is reserved for MCP framing.
    console.error(
      `[bcquality-mcp] Cache at ${cacheAbs} points at ${staleCacheRemote} but ` +
        `BCQUALITY_REPO_URL is ${config.repoUrl}; re-cloning to match the configured repo.`,
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
  const remoteUrl = await readRemoteUrl(cloneGit);
  return { path: cacheAbs, source: 'cloned', commit, headSha, remoteUrl };
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
