import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from './shared.js';
import { LayerEnum, asTextContent, withErrorHandling } from './shared.js';
import { matchesFilters } from '../search/filter.js';
import { scoreEntries } from '../search/score.js';
import { applyLayerPrecedence } from '../repo/index.js';
import { descriptionExcerpt } from '../parser/knowledge.js';

export function registerWorkflowTools(server: McpServer, ctx: ServerContext) {
  // --- search_knowledge ---
  server.registerTool(
    'bcquality_search_knowledge',
    {
      title: 'Search BCQuality knowledge',
      description:
        'Free-text search over knowledge files. Tokenizes the query and scores against frontmatter keywords, ' +
        'title, domain, and the Description section. Combine with structured filters for narrow results.',
      inputSchema: {
        query: z.string().min(1),
        layers: z.array(LayerEnum).optional(),
        domain: z.string().optional(),
        technologies: z.array(z.string()).optional(),
        bcVersion: z.union([z.string(), z.number()]).optional(),
        countries: z.array(z.string()).optional(),
        applicationArea: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      outputSchema: {
        matches: z.array(
          z.object({
            path: z.string(),
            score: z.number(),
            layer: z.string(),
            domain: z.string(),
            title: z.string(),
            descriptionExcerpt: z.string(),
            matchedKeywords: z.array(z.string()),
          }),
        ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    withErrorHandling('bcquality_search_knowledge', async (args) => {
      const layers = args.layers ?? ctx.config.layers;
      const candidates = ctx.index.knowledge
        .filter((e) => layers.includes(e.ref.layer))
        .filter((e) =>
          matchesFilters(e, {
            domain: args.domain,
            technologies: args.technologies,
            bcVersion: args.bcVersion,
            countries: args.countries,
            applicationArea: args.applicationArea,
          }),
        );
      const scored = scoreEntries(candidates, args.query).slice(0, args.limit);
      const matches = scored.map(({ entry, score, matchedKeywords }) => ({
        path: entry.ref.relativePath,
        score,
        layer: entry.ref.layer,
        domain: entry.ref.domain,
        title: entry.parsed?.title ?? entry.ref.slug,
        descriptionExcerpt: entry.parsed ? descriptionExcerpt(entry.parsed) : '',
        matchedKeywords,
      }));
      const structuredContent = { matches };
      return { ...asTextContent(structuredContent), structuredContent };
    }),
  );

  // --- get_applicable_for_context ---
  server.registerTool(
    'bcquality_get_applicable_for_context',
    {
      title: 'Get knowledge applicable to a development context',
      description:
        'Workflow tool — given a development goal and a BC context (technologies, bc-version, …), returns ' +
        'all knowledge files that match every frontmatter dimension, with sections inlined for direct LLM consumption. ' +
        'Applies layer precedence: custom > community > microsoft. Suppressed candidates are surfaced for transparency.',
      inputSchema: {
        goal: z.string().min(1).describe('Free-text description of what the agent is trying to do.'),
        technologies: z.array(z.string()).default(['al']),
        bcVersion: z.union([z.string(), z.number()]).optional(),
        countries: z.array(z.string()).optional(),
        applicationArea: z.array(z.string()).optional(),
        layers: z.array(LayerEnum).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      outputSchema: {
        applicable: z.array(
          z.object({
            path: z.string(),
            layer: z.string(),
            domain: z.string(),
            title: z.string(),
            score: z.number(),
            sections: z.object({
              description: z.string().optional(),
              bestPractice: z.string().optional(),
              antiPattern: z.string().optional(),
            }),
          }),
        ),
        suppressed: z.array(
          z.object({
            path: z.string(),
            layer: z.string(),
            supersededBy: z.string(),
            reason: z.string(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    withErrorHandling('bcquality_get_applicable_for_context', async (args) => {
      const layers = args.layers ?? ctx.config.layers;
      const candidates = ctx.index.knowledge
        .filter((e) => layers.includes(e.ref.layer))
        .filter((e) =>
          matchesFilters(e, {
            technologies: args.technologies,
            bcVersion: args.bcVersion,
            countries: args.countries,
            applicationArea: args.applicationArea,
          }),
        );

      const { kept, suppressed } = applyLayerPrecedence(candidates);
      const scored = scoreEntries(kept, args.goal);
      // Si query trop pauvre, garder les filtrés en l'état.
      const ranked = scored.length > 0 ? scored : kept.map((entry) => ({ entry, score: 0, matchedKeywords: [] }));
      const top = ranked.slice(0, args.limit);

      const applicable = top.map(({ entry, score }) => ({
        path: entry.ref.relativePath,
        layer: entry.ref.layer,
        domain: entry.ref.domain,
        title: entry.parsed?.title ?? entry.ref.slug,
        score,
        sections: {
          description: entry.parsed?.sections.description,
          bestPractice: entry.parsed?.sections.bestPractice,
          antiPattern: entry.parsed?.sections.antiPattern,
        },
      }));

      const suppressedOut = suppressed.map((s) => ({
        path: s.entry.ref.relativePath,
        layer: s.entry.ref.layer,
        supersededBy: s.supersededBy.ref.relativePath,
        reason: 'layer-precedence',
      }));

      const structuredContent = { applicable, suppressed: suppressedOut };
      return { ...asTextContent(structuredContent), structuredContent };
    }),
  );
}
