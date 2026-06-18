import type { KnowledgeEntry } from '../repo/index.js';

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','i','in','is','it','of','on','or','the','this','to','was','were','with','that','an','it','le','la','les','et','des','du','de','un','une','en','pour','par','sur','dans','au','aux','avec'
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9-]+/i)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface ScoredEntry {
  entry: KnowledgeEntry;
  score: number;
  matchedKeywords: string[];
}

export function scoreEntries(entries: KnowledgeEntry[], query: string): ScoredEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return entries.map((entry) => ({ entry, score: 0, matchedKeywords: [] }));
  }
  const out: ScoredEntry[] = [];
  for (const entry of entries) {
    if (!entry.parsed) continue;
    const fm = entry.parsed.frontmatter;
    const keywords = (fm.keywords as string[]).map((k) => k.toLowerCase());
    const titleTokens = tokenize(entry.parsed.title);
    const domainToken = entry.ref.domain.toLowerCase();
    const descTokens = tokenize(entry.parsed.sections.description ?? '');

    let score = 0;
    const matchedKeywords: string[] = [];
    for (const t of tokens) {
      if (keywords.includes(t)) {
        score += 3;
        matchedKeywords.push(t);
      }
      if (titleTokens.includes(t)) score += 2;
      if (domainToken === t) score += 2;
      if (descTokens.includes(t)) score += 1;
      // Sub-string keyword match (kebab-case partial).
      for (const kw of keywords) {
        if (kw.includes(t) && !matchedKeywords.includes(kw)) {
          score += 1;
          matchedKeywords.push(kw);
        }
      }
    }
    if (score > 0) {
      out.push({ entry, score, matchedKeywords });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
