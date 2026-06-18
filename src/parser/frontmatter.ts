import { z } from 'zod';

const StringList = z.array(z.string()).min(1);

// BC version: accepte "all", ou liste mixte de nombres/strings ("26..28").
const BcVersionSchema = z.union([
  z.literal('all'),
  z.array(z.union([z.number().int(), z.string()])).min(1),
]);

export const KnowledgeFrontmatterSchema = z
  .object({
    'bc-version': BcVersionSchema,
    domain: z.string().min(1),
    keywords: z.array(z.string()).min(1),
    technologies: StringList,
    countries: StringList,
    'application-area': StringList,
  })
  .passthrough();

export type KnowledgeFrontmatter = z.infer<typeof KnowledgeFrontmatterSchema>;

export const ActionSkillFrontmatterSchema = z
  .object({
    kind: z.literal('action-skill'),
    id: z.string().min(1),
    version: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    inputs: z.array(z.string()).min(1),
    outputs: z.array(z.string()).min(1),
    'sub-skills': z.array(z.string()).optional(),
    'bc-version': BcVersionSchema.optional(),
    technologies: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    'application-area': z.array(z.string()).optional(),
  })
  .passthrough();

export type ActionSkillFrontmatter = z.infer<typeof ActionSkillFrontmatterSchema>;

export function normalizeBcVersion(value: z.infer<typeof BcVersionSchema>): string[] {
  if (value === 'all') return ['all'];
  return value.map((v) => String(v));
}

export function bcVersionMatches(fileVersions: string[], requestedVersion: string | number | undefined): boolean {
  if (requestedVersion === undefined) return true;
  if (fileVersions.includes('all')) return true;
  const req = String(requestedVersion);
  const reqNum = Number(req);
  for (const v of fileVersions) {
    if (v === req) return true;
    // Range "26..28"
    const range = v.match(/^(\d+)\.\.(\d+)$/);
    if (range && Number.isFinite(reqNum)) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (reqNum >= lo && reqNum <= hi) return true;
    }
  }
  return false;
}
