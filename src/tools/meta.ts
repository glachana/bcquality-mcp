import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from './shared.js';
import { asTextContent, layerSummary, withErrorHandling, BCQualityError } from './shared.js';
import { pullRepo } from '../repo/manager.js';

export function registerMetaTools(server: McpServer, ctx: ServerContext) {
  // --- status ---
  server.registerTool(
    'bcquality_status',
    {
      title: 'BCQuality server status',
      description:
        'Returns the active clone path, its source (env/cache/cloned), the current commit, the enabled layers, ' +
        'article counts per layer, and the in-memory index age.',
      inputSchema: {},
      outputSchema: {
        repoPath: z.string(),
        source: z.string(),
        commit: z.string(),
        headSha: z.string(),
        repoUrl: z.string(),
        layers: z.array(
          z.object({ name: z.string(), enabled: z.boolean(), articleCount: z.number().int() }),
        ),
        skillCount: z.number().int(),
        indexBuiltAt: z.string(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    withErrorHandling('bcquality_status', async () => {
      const structuredContent = {
        repoPath: ctx.repo.path,
        source: ctx.repo.source,
        commit: ctx.repo.commit,
        headSha: ctx.repo.headSha,
        repoUrl: ctx.config.repoUrl,
        layers: layerSummary(ctx),
        skillCount: ctx.index.skills.length,
        indexBuiltAt: ctx.index.builtAt.toISOString(),
      };
      return { ...asTextContent(structuredContent), structuredContent };
    }),
  );

  // --- refresh ---
  server.registerTool(
    'bcquality_refresh',
    {
      title: 'Refresh BCQuality clone',
      description:
        'Runs `git pull` on the active clone and rebuilds the in-memory index. Use after publishing new knowledge ' +
        'to your fork.',
      inputSchema: {},
      outputSchema: {
        before: z.string(),
        after: z.string(),
        changedFiles: z.number().int(),
        rebuiltAt: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling('bcquality_refresh', async () => {
      let result;
      try {
        result = await pullRepo(ctx.repo.path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BCQualityError(
          'BCQ_GIT_ERROR',
          `git pull failed in ${ctx.repo.path}: ${msg}`,
          'Check network access to the remote, verify the clone is not in a detached/dirty state, or re-clone via bcquality_status + a fresh setup.',
        );
      }
      ctx.reload();
      const structuredContent = {
        before: result.before,
        after: result.after,
        changedFiles: result.changedFiles,
        rebuiltAt: new Date().toISOString(),
      };
      return { ...asTextContent(structuredContent), structuredContent };
    }),
  );
}
