/** Optional PubMed progressive enhancement. Every failure resolves to []. */
export interface PubMedCitation { pmid: string; title: string; url: string; }

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
/** One shared budget covers both sequential requests. */
const TIMEOUT_MS = 4000;
const successfulCache = new Map<string, PubMedCitation[]>();
const inFlight = new Map<string, Promise<PubMedCitation[]>>();

export async function fetchPubMedCitations(query: string, retmax = 3): Promise<PubMedCitation[]> {
  const normalized = query.trim();
  if (!normalized || typeof fetch !== "function") return [];
  const key = `${normalized.toLowerCase()}::${retmax}`;
  const cached = successfulCache.get(key);
  if (cached) return cached.map((item) => ({ ...item }));
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const ids = await esearch(normalized, retmax, controller.signal);
      if (!ids.length) return [];
      const citations = await esummary(ids, controller.signal);
      if (citations.length) successfulCache.set(key, citations.map((item) => ({ ...item })));
      return citations;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}

async function esearch(query: string, retmax: number, signal: AbortSignal): Promise<string[]> {
  const url = `${ESEARCH}?db=pubmed&retmode=json&sort=relevance&retmax=${encodeURIComponent(String(retmax))}&term=${encodeURIComponent(query)}`;
  const json = await getJson(url, signal);
  const ids = json?.esearchresult?.idlist;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

async function esummary(ids: string[], signal: AbortSignal): Promise<PubMedCitation[]> {
  const url = `${ESUMMARY}?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(","))}`;
  const json = await getJson(url, signal);
  const result = json?.result;
  if (!result || typeof result !== "object") return [];
  return ids.flatMap((pmid) => {
    const title: unknown = result[pmid]?.title;
    return typeof title === "string" && title.trim()
      ? [{ pmid, title: title.replace(/\.$/, ""), url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` }]
      : [];
  });
}

async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const response = await fetch(url, { method: "GET", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`PubMed HTTP ${response.status}`);
  return response.json();
}
