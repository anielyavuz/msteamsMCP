#!/usr/bin/env node
// Command line entry point.
//
//   login            device code sign-in (requests the scopes of the enabled tools)
//   status           signed-in account, granted scopes, token expiry
//   logout           delete the cached tokens
//   tools            list available / enabled tools and the scopes they need
//   start            serve MCP over local HTTP  (http://127.0.0.1:<port>/mcp, bearer token required)
//   start --stdio    serve MCP over stdio      (the MCP client launches this process)

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAuth } from "./auth.mjs";
import { httpConfigErrors, loadConfig, loadDotEnv } from "./config.mjs";
import { createGraph } from "./graph.mjs";
import { startHttpServer } from "./http.mjs";
import { createLogger } from "./logging.mjs";
import { SERVER_INFO, createMcpServer } from "./mcp.mjs";
import { TOOLS, requiredScopes, selectTools } from "./tools/index.mjs";

function fail(lines) {
  for (const l of [].concat(lines)) console.error(`✖ ${l}`);
  process.exit(1);
}

function setup() {
  loadDotEnv();
  const { config, errors } = loadConfig();
  if (errors.length) fail(errors);
  let tools;
  try {
    tools = selectTools(config.enabledTools, { allowWriteTools: config.allowWriteTools });
  } catch (e) {
    fail(e.message);
  }
  const scopes = requiredScopes(tools);
  const auth = createAuth(config, scopes);
  return { config, tools, scopes, auth };
}

async function cmdLogin() {
  const { config, scopes, auth } = setup();
  console.log(`Tenant:  ${config.tenantId}`);
  console.log(`App:     ${config.clientId}`);
  console.log(`Scopes:  ${scopes.join(" ")} (delegated)\n`);
  const result = await auth.login((r) => {
    console.log(`Open ${r.verificationUri} and enter the code: ${r.userCode}`);
    console.log("Do NOT tick 'Consent on behalf of your organization'. Waiting…\n");
  });
  console.log(`✔ Signed in as ${result.account?.username}`);
  console.log(`  Granted: ${result.scopes.join(" ")}`);
  console.log(`  Token cache: ${config.tokenCachePath} (0600)`);
}

async function cmdStatus() {
  const { config, auth, scopes } = setup();
  const s = await auth.status();
  console.log(JSON.stringify({ ...s, requiredScopes: scopes, tokenCachePath: config.tokenCachePath }, null, 2));
  if (!s.signedIn) process.exitCode = 1;
}

async function cmdLogout() {
  const { auth, config } = setup();
  await auth.logout();
  console.log(`✔ Signed out; removed ${config.tokenCachePath}`);
}

function cmdTools() {
  loadDotEnv();
  const { config } = loadConfig();
  for (const t of TOOLS) {
    const on = config.enabledTools.includes(t.name) ? "enabled " : "disabled";
    console.log(`${on}  ${t.name.padEnd(20)} ${t.access.padEnd(5)} ${(t.scopes.join(" ") || "-").padEnd(14)} ${t.title}`);
  }
}

async function cmdStart(stdio) {
  const { config, tools, scopes, auth } = setup();
  const graph = createGraph(() => auth.getAccessToken());
  const ctx = { graph, auth };
  const logger = createLogger(config.logFile);
  const build = () => createMcpServer(tools, ctx);

  if (stdio) {
    await build().connect(new StdioServerTransport());
    logger.info(`${SERVER_INFO.name} ${SERVER_INFO.version} on stdio · tools: ${tools.map((t) => t.name).join(", ")}`);
    return;
  }

  const errs = httpConfigErrors(config);
  if (errs.length) fail(errs);
  const user = await auth.username();
  logger.info(`${SERVER_INFO.name} ${SERVER_INFO.version} · node ${process.version}`);
  logger.info(`Microsoft account: ${user || "(not signed in — run: npm run login)"} · app: ${config.clientId}`);
  logger.info(`scopes: ${scopes.join(" ")}`);
  logger.info(`tools: ${tools.map((t) => t.name).join(", ")}`);
  if (config.logFile) logger.info(`log file: ${config.logFile}`);
  try {
    await startHttpServer(config, build, { auth, logger });
  } catch (e) {
    fail(e.code === "EADDRINUSE" ? `Port ${config.port} is already in use (another instance running?)` : e.message);
  }
  logger.info(`ready: http://${config.host}:${config.port}/mcp`);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = {
  login: cmdLogin,
  status: cmdStatus,
  logout: cmdLogout,
  tools: cmdTools,
  start: () => cmdStart(rest.includes("--stdio")),
};
if (!commands[cmd]) {
  console.log("Usage: msteams-mcp <login|status|logout|tools|start [--stdio]>");
  process.exit(cmd ? 1 : 0);
}
try {
  await commands[cmd]();
} catch (e) {
  fail(e.message);
}
