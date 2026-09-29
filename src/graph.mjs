// Minimal Microsoft Graph client (fetch). Read-only by construction: only GET is implemented.
// Future write tools must add an explicit method here instead of reusing get().

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class GraphError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {() => Promise<string>} getToken returns a delegated access token
 * @param {{fetchImpl?: typeof fetch, timeoutMs?: number, maxRetries?: number}} [opts]
 */
export function createGraph(getToken, { fetchImpl = fetch, timeoutMs = 30_000, maxRetries = 3 } = {}) {
  /** GET a Graph path ("/me") or an @odata.nextLink URL. Retries 429/503/504 honouring Retry-After. */
  async function get(pathOrUrl) {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
    if (!url.startsWith(`${GRAPH_BASE}/`)) throw new Error("Refusing to call a non-Microsoft-Graph URL");
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${await getToken()}`, accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res.json();
      if ([429, 503, 504].includes(res.status) && attempt < maxRetries) {
        const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await sleep(Math.min(wait, 30) * 1000);
        continue;
      }
      let code = `HTTP_${res.status}`;
      let message = res.statusText;
      try {
        const body = await res.json();
        code = body?.error?.code || code;
        message = body?.error?.message || message;
      } catch {
        /* non-JSON error body */
      }
      throw new GraphError(res.status, code, message);
    }
  }

  /**
   * Follow @odata.nextLink pages until `max` items, `maxPages`, or `stop(item)` returns true.
   * Returns { items, truncated } — truncated = more data existed but was not fetched.
   */
  async function getPaged(path, { max = 50, maxPages = 20, stop } = {}) {
    const items = [];
    let next = path;
    let pages = 0;
    while (next && items.length < max && pages < maxPages) {
      const page = await get(next);
      pages++;
      for (const item of page.value || []) {
        if (stop?.(item)) return { items, truncated: false };
        items.push(item);
        if (items.length >= max) break;
      }
      next = page["@odata.nextLink"];
    }
    return { items, truncated: Boolean(next) };
  }

  return { get, getPaged };
}
