#!/usr/bin/env node
// Self-test against a RUNNING server (npm start). Checks access control and tool exposure;
// with --live also calls Microsoft Graph through the tools. Prints only PASS/FAIL and counts —
// never message content.
//
//   npm run selftest            # security checks
//   npm run selftest -- --live  # + real Graph calls (needs npm run login)

import http from "node:http";
import { loadConfig, loadDotEnv } from "../src/config.mjs";

loadDotEnv();
const { config } = loadConfig();
const live = process.argv.includes("--live");
const PORT = config.port;
let failures = 0;
let rpcId = 0;

function request({ method = "POST", path = "/mcp", host = `127.0.0.1:${PORT}`, token = config.accessToken, body }) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? "" : JSON.stringify(body);
    const headers = { host, "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = http.request({ host: "127.0.0.1", port: PORT, method, path, headers }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.end(data);
  });
}

function rpcResult(text) {
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(line ? line.slice(6) : text);
}

async function rpc(method, params) {
  const r = await request({ body: { jsonrpc: "2.0", id: ++rpcId, method, params } });
  return { status: r.status, msg: rpcResult(r.text) };
}

async function callTool(name, args = {}) {
  const { msg } = await rpc("tools/call", { name, arguments: args });
  const text = msg.result?.content?.[0]?.text ?? msg.error?.message ?? "";
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  return { isError: Boolean(msg.result?.isError || msg.error), text, data };
}

function check(name, ok, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  (${info})` : ""}`);
  if (!ok) failures++;
}

try {
  check("no token → 401", (await request({ token: "", body: {} })).status === 401);
  check("wrong token → 401", (await request({ token: "x".repeat(48), body: {} })).status === 401);
  check("foreign Host header → 403", (await request({ host: `evil.example:${PORT}`, body: {} })).status === 403);
  check("unknown path → 404", (await request({ path: "/other", body: {} })).status === 404);
  check("GET → 405", (await request({ method: "GET" })).status === 405);

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "selftest", version: "1" },
  });
  check("initialize", init.msg.result?.serverInfo?.name === "msteams-mcp", init.msg.result?.serverInfo?.version);

  const list = await rpc("tools/list", {});
  const names = (list.msg.result?.tools || []).map((t) => t.name).sort();
  const expected = [...config.enabledTools].sort();
  check("tools/list == ENABLED_TOOLS", JSON.stringify(names) === JSON.stringify(expected), names.join(", "));
  check(
    "all exposed tools are read-only",
    (list.msg.result?.tools || []).every((t) => t.annotations?.readOnlyHint === true)
  );

  const blocked = await callTool("send_chat_message", { chatId: "19:x@thread.v2", message: "x" });
  check("non-existent / disabled tool is rejected", blocked.isError);

  const status = await callTool("auth_status");
  check("auth_status", status.data?.signedIn === true, status.data?.username || status.text.slice(0, 80));

  if (live) {
    const me = await callTool("get_current_user");
    check("get_current_user", !me.isError && Boolean(me.data?.userPrincipalName));

    const chats = await callTool("list_chats", { limit: 5 });
    check("list_chats", !chats.isError && chats.data?.count >= 0, `${chats.data?.count ?? "?"} chats`);

    const first = chats.data?.chats?.[0];
    if (first) {
      const msgs = await callTool("get_chat_messages", { chatId: first.id, limit: 3 });
      check("get_chat_messages", !msgs.isError && Array.isArray(msgs.data?.messages), `${msgs.data?.count ?? "?"} messages`);
      const oldest = await callTool("get_chat_messages", { chatId: first.id, limit: 3, order: "oldest" });
      check("get_chat_messages order=oldest", !oldest.isError);
    }
    const bad = await callTool("get_chat_messages", { chatId: "not-a-chat-id" });
    check("invalid chatId rejected by input validation", bad.isError);
    const foreign = await callTool("get_chat_messages", { chatId: "19:00000000000000000000000000000000@thread.v2" });
    check("chat that is not mine → error, no data", foreign.isError, foreign.text.slice(0, 60));
  }
} catch (e) {
  console.log(`FAIL  cannot reach http://127.0.0.1:${PORT}/mcp — is the server running? (${e.message})`);
  failures++;
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
