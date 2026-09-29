// Local HTTP transport (MCP Streamable HTTP, stateless) with access control and request logging.
//
// Every request must pass, in order:
//   1. Host header is 127.0.0.1:<port> or localhost:<port>   (blocks DNS-rebinding from web pages) → 403
//   2. path is /mcp                                            → 404
//   3. Authorization: Bearer <MCP_ACCESS_TOKEN> (constant-time) → 401
//   4. method is POST (stateless mode: no GET stream / DELETE)  → 405
// Body limit 1 MB. A fresh MCP server instance handles each request (no session state kept).

import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { argSummary, createClientRegistry, resultSummary } from "./logging.mjs";

const MAX_BODY = 1_000_000;

export function isAuthorized(req, accessToken) {
  const h = req.headers.authorization || "";
  const given = Buffer.from(h.startsWith("Bearer ") ? h.slice(7) : "");
  const want = Buffer.from(accessToken);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function isHostAllowed(req, port) {
  const host = (req.headers.host || "").toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error("request body too large"), { httpStatus: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid JSON"), { httpStatus: 400 });
  }
}

/** Observe the response without changing it: total bytes + first 256 KB (for the result summary). */
function tapResponse(res) {
  const parts = [];
  let bytes = 0;
  const wrap = (fn) => (chunk, ...rest) => {
    if (chunk && typeof chunk !== "function") {
      const b = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk.buffer ?? chunk, chunk.byteOffset ?? 0, chunk.byteLength ?? chunk.length);
      bytes += b.length;
      if (bytes <= 262_144) parts.push(b);
    }
    return fn(chunk, ...rest);
  };
  res.write = wrap(res.write.bind(res));
  res.end = wrap(res.end.bind(res));
  return () => ({ bytes, text: Buffer.concat(parts).toString("utf8") });
}

const sendJson = (res, code, body) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(body));

/**
 * @param {{host:string, port:number, accessToken:string}} config
 * @param {() => import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} buildServer
 * @param {{auth: object, logger: object}} deps
 */
export function startHttpServer(config, buildServer, { auth, logger }) {
  const clientOf = createClientRegistry();
  let seq = 0;

  const server = http.createServer(async (req, res) => {
    const id = ++seq;
    const t0 = Date.now();
    const reject = (code, status, body) => {
      logger.request({ id, op: `${req.method} ${req.url} rejected`, status, ms: 0, kb: 0, client: req.headers["user-agent"] || "?" });
      sendJson(res, code, body);
    };
    if (!isHostAllowed(req, config.port)) return reject(403, "403 host not allowed", { error: "host not allowed" });
    if ((req.url || "").split("?")[0] !== "/mcp") return reject(404, "404", { error: "not found" });
    if (!isAuthorized(req, config.accessToken)) return reject(401, "401 missing/invalid token", { error: "unauthorized" });
    if (req.method !== "POST") {
      return sendJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
    }

    const tap = tapResponse(res);
    let body;
    try {
      body = await readJson(req);
      const mcp = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      logger.info(`#${id} error: ${e.message}`);
      if (!res.headersSent) sendJson(res, e.httpStatus || 500, { jsonrpc: "2.0", error: { code: -32603, message: e.httpStatus ? e.message : "Internal error" }, id: null });
    } finally {
      const done = async () => {
        const msgs = [].concat(body || []);
        const init = msgs.find((m) => m?.method === "initialize")?.params;
        const client = clientOf(req, init);
        const { bytes, text } = tap();
        const user = await auth.username();
        for (const m of msgs) {
          if (!m?.method || m.method.startsWith("notifications/")) continue;
          const call = m.method === "tools/call";
          const r = call ? resultSummary(text) : { status: res.statusCode < 300 ? "ok" : `HTTP ${res.statusCode}`, detail: "" };
          logger.request({
            id,
            op: call ? `tools/call ${m.params?.name}` : m.method,
            args: call ? argSummary(m.params?.arguments) : init && m.method === "initialize" ? `client=${init.clientInfo?.name || "?"}` : "",
            status: r.status,
            detail: r.detail,
            ms: Date.now() - t0,
            kb: Math.round(bytes / 102.4) / 10,
            user: call ? user : "",
            client,
          });
        }
      };
      if (res.writableFinished) done();
      else res.once("finish", done);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve(server));
  });
}
