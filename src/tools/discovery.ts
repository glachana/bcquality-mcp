import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from './shared.js';
import { LayerEnum, asTextContent } from './shared.js';
import { matchesFilters } from '../search/filter.js';
import { descriptionExcerpt } from '../parser/knowledge.js';

export function registerDiscoveryTools(server: McpServer, ctx: ServerContext) {
  // --- list_domains ---
  server.registerTool(
    'bcquality_list_domains',
    {
      title: 'List BCQuality domains',
      description:
        'Lists all knowledge domains (performance, security, privacy, …) present in the configured BCQuality clone, ' +
        'with file counts and which layers contribute.',
      inputSchema: {
        layers: z
          .array(LayerEnum)
          .optional()
          .describe('Subset of layers to consider (defaults to all enabled layers).'),
      },
      outputSchema: {
        domains: z.array(
          z.object({
            name: z.string(),
            fileCount: z.number().int(),
            layers: z.array(z.string()),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ layers }) => {
      const activeLayers = layers ?? ctx.config.layers;
      const map = new Map<string, { count: number; layers: Set<string> }>();
      for (const entry of ctx.index.knowledge) {
        if (!activeLayers.includes(entry.ref.layer)) continue;
        const cur = map.get(entry.ref.domain) ?? { count: 0, layers: new Set<string>() };
        cur.count++;
        cur.layers.add(entry.ref.layer);
        map.set(entry.ref.domain, cur);
      }
      const domains = [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, info]) => ({ name, fileCount: info.count, layers: [...info.layers].sort() }));
      const structuredContent = { domains };
      return { ...asTextContent(structuredContent), structuredContent };
    },
  );

  // --- list_knowledge ---
  server.registerTool(
    'bcquality_list_knowledge',
    {
      title: 'List BCQuality knowledge files',
      description:
        'Lists knowledge files with optional filters on layer, domain, technologies, bc-version, countries, ' +
        'application-area, and keywords. Supports pagination via limit/offset.',
      inputSchema: {
        layer: LayerEnum.optional(),
        domain: z.string().optional(),
        technologies: z.array(z.string()).optional(),
        bcVersion: z.union([z.string(), z.number()]).optional(),
        countries: z.array(z.string()).optional(),
        applicationArea: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).default(0),
      },
      outputSchema: {
        items: z.array(
          z.object({
            path: z.string(),
            layer: z.string(),
            domain: z.string(),
            slug: z.string(),
            title: z.string(),
            descriptionExcerpt: z.string(),
            keywords: z.array(z.string()),
            bcVersion: z.array(z.string()),
            technologies: z.array(z.string()),
            countries: z.array(z.string()),
            applicationArea: z.array(z.string()),
          }),
        ),
        total: z.number().int(),
        nextOffset: z.number().int().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const filtered = ctx.index.knowledge.filter((entry) =>
        matchesFilters(entry, {
          layer: args.layer,
          domain: args.domain,
          technologies: args.technologies,
          bcVersion: args.bcVersion,
          countries: args.countries,
          applicationArea: args.applicationArea,
          keywords: args.keywords,
        }),
      );

      const total = filtered.length;
      const slice = filtered.slice(args.offset, args.offset + args.limit);

      const items = slice.map((entry) => {
        const fm = entry.parsed?.frontmatter;
        const bcVersion =
          fm && fm['bc-version'] === 'all'
            ? ['all']
            : fm
            ? (fm['bc-version'] as Array<string | number>).map(String)
            : [];
        return {
          path: entry.ref.relativePath,
          layer: entry.ref.layer,
          domain: entry.ref.domain,
          slug: entry.ref.slug,
          title: entry.parsed?.title ?? entry.ref.slug,
          descriptionExcerpt: entry.parsed ? descriptionExcerpt(entry.parsed) : '',
          keywords: (fm?.keywords as string[] | undefined) ?? [],
          bcVersion,
          technologies: (fm?.technologies as string[] | undefined) ?? [],
          countries: (fm?.countries as string[] | undefined) ?? [],
          applicationArea: (fm?.['application-area'] as string[] | undefined) ?? [],
        };
      });

      const nextOffset = args.offset + args.limit < total ? args.offset + args.limit : undefined;
      const structuredContent = { items, total, nextOffset };
      return { ...asTextContent(structuredContent), structuredContent };
    },
  );

  // --- list_skills ---
  server.registerTool(
    'bcquality_list_skills',
    {
      title: 'List BCQuality skills',
      description:
        'Lists all skills (meta-skills under /skills/ + action skills under <layer>/skills/). ' +
        'Filter by layer or kind (action-skill | meta).',
      inputSchema: {
        layer: z.enum(['microsoft', 'community', 'custom', 'global']).optional(),
        kind: z.enum(['action-skill', 'meta']).optional(),
      },
      outputSchema: {
        items: z.array(
          z.object({
            path: z.string(),
            layer: z.string(),
            group: z.string().optional(),
            slug: z.string(),
            kind: z.string(),
            id: z.string().optional(),
            version: z.number().int().optional(),
            title: z.string(),
            description: z.string().optional(),
            inputs: z.array(z.string()).optional(),
            outputs: z.array(z.string()).optional(),
            subSkills: z.array(z.string()).optional(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const items = ctx.index.skills
        .filter((s) => !args.layer || s.ref.layer === args.layer)
        .filter((s) => !args.kind || s.parsed?.kind === args.kind)
        .map((s) => {
          const fm = s.parsed?.frontmatter as Record<string, unknown> | undefined;
          return {
            path: s.ref.relativePath,
            layer: s.ref.layer,
            group: s.ref.group,
            slug: s.ref.slug,
            kind: s.parsed?.kind ?? 'unknown',
            id: typeof fm?.id === 'string' ? (fm.id as string) : undefined,
            version: typeof fm?.version === 'number' ? (fm.version as number) : undefined,
            title: s.parsed?.title ?? s.ref.slug,
            description: typeof fm?.description === 'string' ? (fm.description as string) : undefined,
            inputs: Array.isArray(fm?.inputs) ? (fm!.inputs as string[]) : undefined,
            outputs: Array.isArray(fm?.outputs) ? (fm!.outputs as string[]) : undefined,
            subSkills: Array.isArray(fm?.['sub-skills']) ? (fm!['sub-skills'] as string[]) : undefined,
          };
        });
      const structuredContent = { items };
      return { ...asTextContent(structuredContent), structuredContent };
    },
  );
}
