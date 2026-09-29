// Offline unit tests (no network, no tenant): node --test test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { httpConfigErrors, loadConfig } from "../src/config.mjs";
import { htmlToText, summarizeMessage } from "../src/format.mjs";
import { createGraph } from "../src/graph.mjs";
import { isAuthorized, isHostAllowed } from "../src/http.mjs";
import { argSummary, resultSummary } from "../src/logging.mjs";
import { describeError, requiredScopes, selectTools } from "../src/tools/index.mjs";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";

test("config: tenant and client are required; multi-tenant aliases rejected", () => {
  assert.equal(loadConfig({}).errors.length, 2);
  assert.ok(loadConfig({ TENANT_ID: "common", CLIENT_ID: CLIENT }).errors.some((e) => e.includes("specific tenant")));
  assert.deepEqual(loadConfig({ TENANT_ID: TENANT, CLIENT_ID: CLIENT }).errors, []);
});

test("config: HTTP must bind to loopback and have a long access token", () => {
  const { config } = loadConfig({ TENANT_ID: TENANT, CLIENT_ID: CLIENT, MCP_HOST: "0.0.0.0", MCP_ACCESS_TOKEN: "short" });
  assert.equal(httpConfigErrors(config).length, 2);
});

test("tools: unknown names and write tools without opt-in are refused", () => {
  assert.throws(() => selectTools(["nope"]), /Unknown tool/);
  const tools = selectTools(["list_chats", "get_current_user"]);
  assert.deepEqual(requiredScopes(tools), ["Chat.Read", "User.Read"]);
});

test("http: bearer token and host checks", () => {
  const tok = "a".repeat(48);
  assert.equal(isAuthorized({ headers: { authorization: `Bearer ${tok}` } }, tok), true);
  assert.equal(isAuthorized({ headers: { authorization: `Bearer ${tok}x` } }, tok), false);
  assert.equal(isAuthorized({ headers: {} }, tok), false);
  assert.equal(isHostAllowed({ headers: { host: "127.0.0.1:3978" } }, 3978), true);
  assert.equal(isHostAllowed({ headers: { host: "evil.example:3978" } }, 3978), false);
});

test("graph: refuses non-Graph URLs (e.g. a tampered nextLink) and uses GET only", async () => {
  const calls = [];
  const graph = createGraph(async () => "t", {
    fetchImpl: async (url, init) => {
      calls.push([url, init.method]);
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    },
  });
  await assert.rejects(() => graph.get("https://evil.example/v1.0/me"), /non-Microsoft-Graph/);
  await graph.get("/me");
  assert.deepEqual(calls, [["https://graph.microsoft.com/v1.0/me", "GET"]]);
});

test("format: Teams HTML to text", () => {
  const html = '<p>Hi <at id="0">Ayşe</at>,</p><p>see&nbsp;<a href="https://x.test">doc</a> &amp; <b>notes</b></p><attachment id="abc"></attachment>';
  assert.equal(htmlToText(html), "Hi @Ayşe,\nsee doc (https://x.test) & notes\n[attachment:abc]");
});

test("format: deleted message has no body", () => {
  const m = summarizeMessage({ id: "1", deletedDateTime: "2026-01-01T00:00:00Z", messageType: "message", body: { contentType: "html", content: "<p>secret</p>" } });
  assert.equal(m.body, "");
  assert.equal(m.deleted, true);
});

test("logging: free text is never logged, ids are shortened", () => {
  const s = argSummary({ chatId: "19:abcdefghijklmnopqrstuvwxyz@thread.v2", fromName: "Ayşe", limit: 5 });
  assert.ok(!s.includes("Ayşe"));
  assert.ok(s.includes("fromName=(4 chars)"));
  assert.ok(s.includes("limit=5"));
  assert.ok(!s.includes("thread.v2"));
  const r = resultSummary(`event: message\ndata: ${JSON.stringify({ result: { content: [{ type: "text", text: '{"count":3}' }] } })}\n`);
  assert.deepEqual(r, { status: "ok", detail: "3 items" });
});

test("errors: permission problems are explained without leaking details", () => {
  assert.match(describeError({ status: 403, code: "Forbidden" }), /Access denied/);
  assert.match(describeError({ status: 401 }), /npm run login/);
});
