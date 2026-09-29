// Tool registry. To add a capability: write a tool object (see ../../docs/ARCHITECTURE.md "Adding a tool"),
// add it to TOOLS, then enable it via ENABLED_TOOLS. Scopes are derived from the enabled tools automatically.
//
// Tool object:
//   name         unique MCP tool name (snake_case)
//   title        short human title
//   description  what it does (the AI client reads this to decide when to call it)
//   access       "read" | "write" — write tools need ALLOW_WRITE_TOOLS=true
//   scopes       delegated Microsoft Graph scopes it needs, e.g. ["Chat.Read"]
//   inputSchema  zod shape of the arguments ({} for none)
//   handler      async (args, { graph, auth }) => JSON-serializable result

import { getChatMessages, listChats } from "./chats.mjs";
import { authStatus, getCurrentUser } from "./user.mjs";

export const TOOLS = [authStatus, getCurrentUser, listChats, getChatMessages];

const BASE_SCOPES = ["User.Read"];   // sign-in + basic profile; always requested

/** Resolve enabled tool objects; throws on unknown names or write tools without explicit opt-in. */
export function selectTools(enabledNames, { allowWriteTools = false } = {}) {
  const byName = new Map(TOOLS.map((t) => [t.name, t]));
  const unknown = enabledNames.filter((n) => !byName.has(n));
  if (unknown.length) throw new Error(`Unknown tool(s) in ENABLED_TOOLS: ${unknown.join(", ")}`);
  const selected = enabledNames.map((n) => byName.get(n));
  const writes = selected.filter((t) => t.access !== "read").map((t) => t.name);
  if (writes.length && !allowWriteTools) {
    throw new Error(`Write tool(s) enabled without ALLOW_WRITE_TOOLS=true: ${writes.join(", ")}`);
  }
  return selected;
}

/** Union of scopes the selected tools need (what login requests and the token must contain). */
export function requiredScopes(tools) {
  return [...new Set([...BASE_SCOPES, ...tools.flatMap((t) => t.scopes)])].sort();
}

/** User-facing error text: explains permission / sign-in problems, never leaks tokens. */
export function describeError(e) {
  if (e?.name === "AuthError" || e?.constructor?.name === "AuthError") return e.message;
  if (e?.status === 401) return "Microsoft Graph rejected the token (401). Run: npm run login";
  if (e?.status === 403) return `Access denied by Microsoft Graph (403 ${e.code}): the signed-in user or app lacks permission for this resource.`;
  if (e?.status === 404) return `Not found (404 ${e.code}): check the id, and that it belongs to the signed-in user.`;
  if (e?.status) return `Microsoft Graph error ${e.status} ${e.code}: ${e.message}`;
  if (e?.name === "TimeoutError") return "Microsoft Graph did not respond in time; try again.";
  return `Unexpected error: ${e?.message || e}`;
}

/** Register the selected tools on an McpServer instance. */
export function registerTools(server, tools, ctx) {
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        annotations: { readOnlyHint: t.access === "read", destructiveHint: false, openWorldHint: false },
      },
      async (args) => {
        try {
          const data = await t.handler(args || {}, ctx);
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
          return { isError: true, content: [{ type: "text", text: describeError(e) }] };
        }
      }
    );
  }
}
