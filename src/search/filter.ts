import type { KnowledgeEntry } from '../repo/index.js';
import { bcVersionMatches, normalizeBcVersion } from '../parser/frontmatter.js';

export interface KnowledgeFilters {
  layer?: string;
  domain?: string;
  technologies?: string[];
  bcVersion?: string | number;
  countries?: string[];
  applicationArea?: string[];
  keywords?: string[];
}

function intersect(a: string[], b: string[]): boolean {
  const set = new Set(a.map((s) => s.toLowerCase()));
  return b.some((x) => set.has(x.toLowerCase()));
}

export function matchesFilters(entry: KnowledgeEntry, filters: KnowledgeFilters): boolean {
  if (filters.layer && entry.ref.layer !== filters.layer) return false;
  if (filters.domain && entry.ref.domain !== filters.domain) return false;
  if (!entry.parsed) {
    // Si le frontmatter est invalide, on ne peut filtrer que par layer/domain.
    return !filters.technologies && filters.bcVersion === undefined && !filters.countries && !filters.applicationArea && !filters.keywords;
  }
  const fm = entry.parsed.frontmatter;

  if (filters.technologies && filters.technologies.length > 0) {
    if (!intersect(fm.technologies as string[], filters.technologies)) return false;
  }

  if (filters.bcVersion !== undefined) {
    const versions = normalizeBcVersion(fm['bc-version']);
    if (!bcVersionMatches(versions, filters.bcVersion)) return false;
  }

  if (filters.countries && filters.countries.length > 0) {
    const fileCountries = fm.countries as string[];
    if (!fileCountries.includes('w1') && !intersect(fileCountries, filters.countries)) return false;
  }

  if (filters.applicationArea && filters.applicationArea.length > 0) {
    const fileAreas = fm['application-area'] as string[];
    if (!fileAreas.includes('all') && !intersect(fileAreas, filters.applicationArea)) return false;
  }

  if (filters.keywords && filters.keywords.length > 0) {
    if (!intersect(fm.keywords as string[], filters.keywords)) return false;
  }

  return true;
}
