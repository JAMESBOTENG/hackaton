/**
 * TAO — OPTIONAL PubMed live-citation fetch (progressive enhancement).
 *
 * ⚠️ BEST-EFFORT ONLY. The TAO demo is guaranteed to work fully offline with
 * the curated references bundled in data/conditions.ts. This module layers a
 * few *live* PubMed citations on top of those bundled references WHEN, and only
 * when, a quick unauthenticated request to the NCBI E-utilities succeeds.
 *
 * It uses the public E-utilities endpoints with NO API key:
 *   • esearch.fcgi — resolve a query to a list of PubMed ids (PMIDs).
 *   • esummary.fcgi — fetch titles for those PMIDs.
 *
 * Every call is wrapped so that ANY failure — offline, CORS, DNS, timeout,
 * rate-limit, malformed JSON, non-OK status — resolves to an empty array and
 * never throws. The caller treats an empty result as "no live results, show the
 * bundled references" so the UI can never end up broken or blank because of the
 * network. Rendering must never block on this.
 */

/** A live citation resolved from PubMed. */
export interface PubMedCitation {
  /** PubMed id. */
  pmid: string;
  /** Article title (as returned by esummary). */
  title: string;
  /** Canonical PubMed article URL. */
  url: string;
}

const ESEARCH =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

/** How long to wait before giving up on PubMed, in ms. Kept short on purpose. */
const TIMEOUT_MS = 4000;
const citationCache = new Map<string, Promise<PubMedCitation[]>>();

/**
 * Fetch a few recent PubMed citations for a free-text query. Resolves to an
 * empty array on any error so callers can safely fall back to bundled refs.
 *
 * @param query    free-text search, e.g. a condition name
 * @param retmax   max citations to return (default 3)
 */
export async function fetchPubMedCitations(
  query: string,
  retmax = 3
): Promise<PubMedCitation[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  if (typeof fetch !== "function") return [];
  const key = `${normalized.toLowerCase()}::${retmax}`;
  const cached = citationCache.get(key);
  if (cached) return cached;
  const request = (async () => {
    try {
      const ids = await esearch(normalized, retmax);
      if (ids.length === 0) return [];
      return await esummary(ids);
    } catch {
      return [];
    }
  })();
  citationCache.set(key, request);
  return request;
}

/** Resolve a query to a list of PMIDs via esearch. Throws on any failure. */
async function esearch(query: string, retmax: number): Promise<string[]> {
  const url =
    `${ESEARCH}?db=pubmed&retmode=json&sort=relevance` +
    `&retmax=${encodeURIComponent(String(retmax))}` +
    `&term=${encodeURIComponent(query)}`;
  const json = await getJson(url);
  const ids = json?.esearchresult?.idlist;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string");
}

/** Fetch titles for a list of PMIDs via esummary. Throws on any failure. */
async function esummary(ids: string[]): Promise<PubMedCitation[]> {
  const url =
    `${ESUMMARY}?db=pubmed&retmode=json` +
    `&id=${encodeURIComponent(ids.join(","))}`;
  const json = await getJson(url);
  const result = json?.result;
  if (!result || typeof result !== "object") return [];

  const citations: PubMedCitation[] = [];
  for (const pmid of ids) {
    const entry = result[pmid];
    const title: unknown = entry?.title;
    if (typeof title === "string" && title.trim()) {
      citations.push({
        pmid,
        title: title.replace(/\.$/, ""),
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      });
    }
  }
  return citations;
}

/**
 * GET + parse JSON with a short AbortController timeout. Throws on timeout,
 * network error, or a non-OK HTTP status.
 */
async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`PubMed HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
