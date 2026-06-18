import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Config, Layer } from '../config.js';
import { KNOWN_LAYERS } from '../config.js';
import type { RepoInfo } from '../repo/manager.js';
import type { KnowledgeIndex } from '../repo/index.js';
import { buildIndex } from '../repo/index.js';

export interface ServerContext {
  config: Config;
  repo: RepoInfo;
  index: KnowledgeIndex;
  reload: () => void;
}

export function createContext(config: Config, repo: RepoInfo): ServerContext {
  let index = buildIndex(repo.path, config.layers);
  return {
    config,
    repo,
    get index() {
      return index;
    },
    reload: () => {
      index = buildIndex(repo.path, config.layers);
    },
  } as ServerContext;
}

export function asTextContent(payload: unknown): { content: [{ type: 'text'; text: string }] } {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export const LayerEnum = z.enum(KNOWN_LAYERS);

export function resolveRepoPath(ctx: ServerContext, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`Invalid path "${relativePath}": must be repo-relative without traversal.`);
  }
  const abs = path.resolve(ctx.repo.path, normalized);
  const repoAbs = path.resolve(ctx.repo.path);
  if (!abs.startsWith(repoAbs)) {
    throw new Error(`Path "${relativePath}" escapes repo root.`);
  }
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found in repo: "${relativePath}"`);
  }
  return abs;
}

export function layerSummary(ctx: ServerContext): Array<{ name: Layer; enabled: boolean; articleCount: number }> {
  return KNOWN_LAYERS.map((name) => {
    const enabled = ctx.config.layers.includes(name);
    const articleCount = ctx.index.knowledge.filter((e) => e.ref.layer === name).length;
    return { name, enabled, articleCount };
  });
}
