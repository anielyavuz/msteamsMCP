// Request audit log: one line per MCP request on stderr, optionally JSON lines to LOG_FILE (0600).
// Logged: who (Microsoft account), which client/version, which tool + safe argument summary, result, duration, size.
// Never logged: message content, free-text arguments (only their length), tokens.

import { appendFileSync } from "node:fs";

// Arguments whose values are safe to print as-is (options, numbers, dates). Other strings → length only.
const SAFE_ARGS = new Set(["limit", "order", "format", "chatType", "since", "until", "includeSystemMessages"]);

const short = (s, n = 18) => (typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s);

/** Safe one-line summary of tool arguments: ids shortened, free text reduced to its length. */
export function argSummary(args = {}) {
  return Object.entries(args)
    .map(([k, v]) => {
      if (/id$/i.test(k)) return `${k}=${short(String(v))}`;
      if (typeof v === "string" && !SAFE_ARGS.has(k)) return `${k}=(${v.length} chars)`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .join(" ");
}

/** Summarize a JSON-RPC response body (JSON or SSE "data:" lines): ok / tool error / rpc error + item count. */
export function resultSummary(bodyText) {
  const datas = bodyText.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6));
  for (const p of datas.length ? datas : [bodyText]) {
    let msg;
    try {
      msg = JSON.parse(p);
    } catch {
      continue;
    }
    if (msg.error) return { status: "rpc error", detail: short(msg.error.message, 80) };
    if (msg.result?.isError) {
      return { status: "tool error", detail: short((msg.result.content?.[0]?.text || "").replace(/\s+/g, " "), 120) };
    }
    if (msg.result) {
      let detail = "";
      try {
        const data = JSON.parse(msg.result.content?.[0]?.text ?? "");
        if (typeof data?.count === "number") detail = `${data.count} items`;
      } catch {
        /* not JSON */
      }
      return { status: "ok", detail };
    }
  }
  return { status: "ok", detail: "" };
}

/** Remember the client name/version announced in `initialize`, keyed by user-agent (stateless HTTP). */
export function createClientRegistry() {
  const clients = new Map();
  return (req, initParams) => {
    const ua = req.headers["user-agent"] || "?";
    const ci = initParams?.clientInfo;
    if (ci) clients.set(ua, `${ci.title || ci.name || "?"} ${ci.version || ""}`.trim());
    const proto = req.headers["mcp-protocol-version"] || initParams?.protocolVersion || "";
    return `${clients.get(ua) || ua}${proto ? ` · MCP ${proto}` : ""}`;
  };
}

export function createLogger(logFile) {
  const now = () => new Date().toISOString();
  return {
    info(msg) {
      console.error(now(), msg);
    },
    request(e) {
      const line =
        `#${e.id} ${e.op}${e.args ? ` (${e.args})` : ""} → ${e.status}${e.detail ? ` [${e.detail}]` : ""}` +
        ` · ${e.ms} ms · ${e.kb} KB${e.user ? ` · ${e.user}` : ""} · ${e.client}`;
      console.error(now(), line);
      if (!logFile) return;
      try {
        appendFileSync(logFile, `${JSON.stringify({ ts: now(), ...e })}\n`, { mode: 0o600 });
      } catch (err) {
        console.error(now(), `cannot write LOG_FILE: ${err.message}`);
      }
    },
  };
}
