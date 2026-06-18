import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from './shared.js';
import { asTextContent, resolveRepoPath, withErrorHandling } from './shared.js';
import { parseKnowledgeFile } from '../parser/knowledge.js';
import { parseSkillFile } from '../parser/skill.js';
import { findExampleFiles } from '../repo/walker.js';

export function registerReadTools(server: McpServer, ctx: ServerContext) {
  // --- get_knowledge ---
  server.registerTool(
    'bcquality_get_knowledge',
    {
      title: 'Get BCQuality knowledge file',
      description:
        'Returns the parsed frontmatter, title, and named sections (Description, Best Practice, Anti Pattern, …) ' +
        'of a knowledge file, plus the paths of associated .good.al / .bad.al examples if present.',
      inputSchema: {
        path: z.string().describe('Repo-relative path, e.g. microsoft/knowledge/performance/use-isempty-for-existence-check.md'),
      },
      outputSchema: {
        path: z.string(),
        title: z.string(),
        frontmatter: z.record(z.unknown()),
        sections: z.object({
          description: z.string().optional(),
          bestPractice: z.string().optional(),
          antiPattern: z.string().optional(),
          other: z.array(z.object({ heading: z.string(), body: z.string() })),
        }),
        exampleFiles: z.object({
          good: z.string().optional(),
          bad: z.string().optional(),
        }),
        body: z.string(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    withErrorHandling('bcquality_get_knowledge', async ({ path: relPath }) => {
      const abs = resolveRepoPath(ctx, relPath, { allowedExtensions: ['.md'] });
      const parsed = parseKnowledgeFile(abs);
      const examples = findExampleFiles(abs);
      const toRel = (p?: string) =>
        p ? path.relative(ctx.repo.path, p).split(path.sep).join('/') : undefined;

      const structuredContent = {
        path: relPath,
        title: parsed.title,
        frontmatter: parsed.frontmatter as Record<string, unknown>,
        sections: parsed.sections,
        exampleFiles: {
          good: toRel(examples.good),
          bad: toRel(examples.bad),
        },
        body: parsed.body,
      };
      return { ...asTextContent(structuredContent), structuredContent };
    }),
  );

  // --- get_examples ---
  server.registerTool(
    'bcquality_get_examples',
    {
      title: 'Get BCQuality knowledge examples',
      description:
        'Returns the content of the .good.al and/or .bad.al example files sibling to a knowledge file.',
      inputSchema: {
        knowledgePath: z.string().describe('Repo-relative path to the .md knowledge file.'),
        kind: z.enum(['good', 'bad', 'both']).default('both'),
      },
      outputSchema: {
        good: z
          .object({ path: z.string(), content: z.string() })
          .optional(),
        bad: z
          .object({ path: z.string(), content: z.string() })
          .optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    withErrorHandling('bcquality_get_examples', async ({ knowledgePath, kind }) => {
      const abs = resolveRepoPath(ctx, knowledgePath, { allowedExtensions: ['.md'] });
      const examples = findExampleFiles(abs);
      const toRel = (p: string) => path.relative(ctx.repo.path, p).split(path.sep).join('/');
      const out: { good?: { path: string; content: string }; bad?: { path: string; content: string } } = {};
      if ((kind === 'good' || kind === 'both') && examples.good) {
        out.good = { path: toRel(examples.good), content: fs.readFileSync(examples.good, 'utf8') };
      }
      if ((kind === 'bad' || kind === 'both') && examples.bad) {
        out.bad = { path: toRel(examples.bad), content: fs.readFileSync(examples.bad, 'utf8') };
      }
      return { ...asTextContent(out), structuredContent: out };
    }),
  );

  // --- get_skill ---
  server.registerTool(
    'bcquality_get_skill',
    {
      title: 'Get BCQuality skill file',
      description:
        'Returns the parsed contents of a skill file — either a meta-skill (skills/entry.md, read.md, do.md, write.md) ' +
        'or an action skill under <layer>/skills/.',
      inputSchema: {
        path: z.string().describe('Repo-relative path, e.g. skills/entry.md or microsoft/skills/review/al-performance-review.md'),
      },
      outputSchema: {
        path: z.string(),
        kind: z.string(),
        title: z.string(),
        frontmatter: z.record(z.unknown()),
        body: z.string(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    withErrorHandling('bcquality_get_skill', async ({ path: relPath }) => {
      const abs = resolveRepoPath(ctx, relPath, { allowedExtensions: ['.md'] });
      const parsed = parseSkillFile(abs);
      const structuredContent = {
        path: relPath,
        kind: parsed.kind,
        title: parsed.title,
        frontmatter: parsed.frontmatter as Record<string, unknown>,
        body: parsed.body,
      };
      return { ...asTextContent(structuredContent), structuredContent };
    }),
  );
}
