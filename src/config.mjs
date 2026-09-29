// Configuration: reads .env (if present) + environment variables and validates them.
// Nothing secret is hard-coded; every deployment supplies its own tenant and app registration.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const DEFAULT_TOOLS = ["auth_status", "get_current_user", "list_chats", "get_chat_messages"];

/** Minimal .env loader: KEY=VALUE lines, # comments, optional quotes. Existing env vars win. */
export function loadDotEnv(path = resolve(process.cwd(), ".env"), env = process.env) {
  if (!existsSync(path)) return false;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in env)) env[key] = value;
  }
  return true;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const expandHome = (p) => (p && (p === "~" || p.startsWith("~/")) ? join(homedir(), p.slice(1)) : p);
const list = (s) => String(s || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

/**
 * Build the runtime configuration.
 * Returns { config, errors } — callers decide whether errors are fatal (e.g. `status` can still run).
 */
export function loadConfig(env = process.env) {
  const errors = [];
  const tenantId = (env.TENANT_ID || "").trim();
  const clientId = (env.CLIENT_ID || "").trim();

  if (!tenantId) errors.push("TENANT_ID is required (Directory (tenant) ID or primary domain)");
  else if (!GUID.test(tenantId) && !DOMAIN.test(tenantId)) errors.push("TENANT_ID must be a GUID or a domain");
  if (["common", "organizations", "consumers"].includes(tenantId.toLowerCase())) {
    errors.push("TENANT_ID must be a specific tenant, not a multi-tenant alias");
  }
  if (!clientId) errors.push("CLIENT_ID is required (your own Entra app registration, see docs/ENTRA-SETUP.md)");
  else if (!GUID.test(clientId)) errors.push("CLIENT_ID must be a GUID");

  const config = {
    tenantId,
    clientId,
    enabledTools: env.ENABLED_TOOLS ? list(env.ENABLED_TOOLS) : [...DEFAULT_TOOLS],
    allowWriteTools: env.ALLOW_WRITE_TOOLS === "true",
    host: env.MCP_HOST || "127.0.0.1",
    port: Number(env.MCP_PORT || 3978),
    accessToken: env.MCP_ACCESS_TOKEN || "",
    logFile: expandHome(env.LOG_FILE || ""),
    tokenCachePath: expandHome(env.TOKEN_CACHE_PATH) || join(homedir(), ".msteams-mcp", "token-cache.json"),
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) errors.push("MCP_PORT must be 1-65535");
  return { config, errors };
}

/** Extra checks that only apply when serving over HTTP. */
export function httpConfigErrors(config) {
  const errors = [];
  if (!["127.0.0.1", "localhost", "::1"].includes(config.host)) {
    errors.push("MCP_HOST must be a loopback address (127.0.0.1 / localhost / ::1); remote exposure is not supported");
  }
  if (config.accessToken.length < 32) {
    errors.push("MCP_ACCESS_TOKEN must be at least 32 characters (generate: openssl rand -hex 24)");
  }
  return errors;
}
