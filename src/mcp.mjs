// Builds the MCP server object with only the enabled tools registered.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools/index.mjs";

export const SERVER_INFO = { name: "msteams-mcp", version: "0.1.0" };

/**
 * @param {object[]} tools selected tool objects (tools/index.mjs selectTools)
 * @param {{graph: object, auth: object}} ctx shared Graph client + auth
 */
export function createMcpServer(tools, ctx) {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Read-only access to the signed-in user's Microsoft Teams chats. Use list_chats to find a chat id, then get_chat_messages.",
  });
  registerTools(server, tools, ctx);
  return server;
}
