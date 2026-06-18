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

// --- Structured errors -------------------------------------------------------

export type BCQErrorCode =
  | 'BCQ_PATH_INVALID'
  | 'BCQ_PATH_ESCAPES_REPO'
  | 'BCQ_PATH_EXTENSION'
  | 'BCQ_NOT_FOUND'
  | 'BCQ_PARSE_ERROR'
  | 'BCQ_GIT_ERROR'
  | 'BCQ_INVALID_ARGUMENT'
  | 'BCQ_INTERNAL';

export class BCQualityError extends Error {
  constructor(
    public readonly code: BCQErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'BCQualityError';
  }
}

interface ErrorPayload {
  error: BCQErrorCode;
  message: string;
  hint?: string;
  tool: string;
}

interface ToolErrorResult {
  content: [{ type: 'text'; text: string }];
  isError: true;
}

function buildErrorPayload(toolName: string, err: unknown): ErrorPayload {
  if (err instanceof BCQualityError) {
    return {
      error: err.code,
      message: err.message,
      hint: err.hint,
      tool: toolName,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Heuristic mapping for known low-level errors.
  if (msg.includes('ENOENT')) {
    return {
      error: 'BCQ_NOT_FOUND',
      message: msg,
      hint: 'The target file was not found on disk. Run bcquality_refresh or verify the path with bcquality_list_knowledge.',
      tool: toolName,
    };
  }
  return {
    error: 'BCQ_INTERNAL',
    message: `Unhandled error in ${toolName}: ${msg}`,
    hint: 'Check server stderr logs for the full stack trace, then file an issue if reproducible.',
    tool: toolName,
  };
}

export function errorResult(toolName: string, err: unknown): ToolErrorResult {
  const payload = buildErrorPayload(toolName, err);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

/**
 * Wraps a tool handler so that any throw is converted into a structured
 * MCP error result (isError: true + JSON payload with code/message/hint).
 * The full stack is logged to stderr for debugging.
 */
export function withErrorHandling<TArgs, TResult extends object>(
  toolName: string,
  fn: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult | ToolErrorResult> {
  return async (args: TArgs) => {
    try {
      return await fn(args);
    } catch (err) {
      const stack = err instanceof Error ? err.stack ?? err.message : String(err);
      console.error(`[bcquality-mcp] Tool "${toolName}" failed: ${stack}`);
      return errorResult(toolName, err);
    }
  };
}

// --- Path validation ---------------------------------------------------------

export interface ResolveOptions {
  /** Whitelist of accepted file extensions, e.g. ['.md']. Empty/undefined = any. */
  allowedExtensions?: readonly string[];
}

/**
 * Resolves a repo-relative path safely:
 *  - rejects absolute paths (Windows drive letters included),
 *  - rejects any traversal that escapes the repo root,
 *  - optionally enforces a file-extension whitelist,
 *  - verifies the file exists.
 *
 * Throws BCQualityError with an actionable hint on failure.
 */
export function resolveRepoPath(
  ctx: ServerContext,
  relativePath: string,
  opts: ResolveOptions = {},
): string {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new BCQualityError(
      'BCQ_PATH_INVALID',
      'Path is empty.',
      'Pass a repo-relative path such as "microsoft/knowledge/performance/use-isempty-for-existence-check.md".',
    );
  }

  const normalized = relativePath.replace(/\\/g, '/').trim();

  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
    throw new BCQualityError(
      'BCQ_PATH_INVALID',
      `Path "${relativePath}" is absolute.`,
      'Use a path relative to the BCQuality repo root, e.g. "microsoft/knowledge/<domain>/<slug>.md".',
    );
  }

  const repoAbs = path.resolve(ctx.repo.path);
  const abs = path.resolve(repoAbs, normalized);
  const rel = path.relative(repoAbs, abs);

  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new BCQualityError(
      'BCQ_PATH_ESCAPES_REPO',
      `Path "${relativePath}" escapes the BCQuality repo root.`,
      'Provide a path that stays inside the configured BCQuality clone.',
    );
  }

  if (opts.allowedExtensions && opts.allowedExtensions.length > 0) {
    const ext = path.extname(abs).toLowerCase();
    if (!opts.allowedExtensions.includes(ext)) {
      throw new BCQualityError(
        'BCQ_PATH_EXTENSION',
        `Path "${relativePath}" has extension "${ext || '(none)'}" which is not allowed for this tool.`,
        `Expected one of: ${opts.allowedExtensions.join(', ')}.`,
      );
    }
  }

  if (!fs.existsSync(abs)) {
    throw new BCQualityError(
      'BCQ_NOT_FOUND',
      `File "${relativePath}" was not found in the BCQuality clone.`,
      'Discover available files with bcquality_list_knowledge or bcquality_list_skills, then retry with an exact path.',
    );
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
