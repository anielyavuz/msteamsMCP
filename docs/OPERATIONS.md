# Operations

## Install

```bash
git clone https://github.com/anielyavuz/msteamsMCP.git && cd msteamsMCP
npm ci --ignore-scripts          # exact versions from package-lock.json, no install scripts
npm test                         # offline unit tests
cp .env.example .env && chmod 600 .env
# edit .env: TENANT_ID, CLIENT_ID (docs/ENTRA-SETUP.md), MCP_ACCESS_TOKEN=$(openssl rand -hex 24)
npm run login
npm start
npm run selftest -- --live       # in a second terminal
```

## Commands

| Command | What it does |
|---|---|
| `npm run login` | Device code sign-in with the scopes of the enabled tools |
| `npm run status` | Account, granted vs. required scopes, token expiry (exit 1 if not signed in) |
| `npm run logout` | Delete cached tokens |
| `npm run tools` | All tools, enabled or not, with access type and scopes |
| `npm start` | HTTP server on `http://127.0.0.1:<MCP_PORT>/mcp` |
| `npm run start:stdio` | stdio mode (the MCP client starts the process; no port, no bearer token) |
| `npm run selftest [-- --live]` | Check a running server |
| `npm test` | Offline unit tests |

## Configuration (.env)

| Variable | Default | Meaning |
|---|---|---|
| `TENANT_ID` | – (required) | Directory (tenant) ID or primary domain |
| `CLIENT_ID` | – (required) | Application (client) ID of your app registration |
| `ENABLED_TOOLS` | `auth_status,get_current_user,list_chats,get_chat_messages` | Tools exposed to clients |
| `ALLOW_WRITE_TOOLS` | `false` | Must be `true` to enable any write tool (none exist in v0.1) |
| `MCP_HOST` | `127.0.0.1` | Loopback only; other values are refused |
| `MCP_PORT` | `3978` | HTTP port |
| `MCP_ACCESS_TOKEN` | – (required for HTTP) | Bearer token clients must send; ≥ 32 chars |
| `TOKEN_CACHE_PATH` | `~/.msteams-mcp/token-cache.json` | Refresh-token cache (0600) — protect like a password |
| `LOG_FILE` | – | Optional JSON-lines audit log (0600) |

## Connect a client

**VS Code** (1.100+): `Cmd/Ctrl+Shift+P` → **MCP: Open User Configuration**:
```json
{
  "inputs": [
    { "type": "promptString", "id": "msteams-mcp-token", "description": "msteams-mcp MCP_ACCESS_TOKEN", "password": true }
  ],
  "servers": {
    "msteams-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:3978/mcp",
      "headers": { "Authorization": "Bearer ${input:msteams-mcp-token}" }
    }
  }
}
```
Start the server entry, paste the token once (stored in VS Code's secret storage). Use Copilot Chat in
**Agent** mode.

**stdio clients** (e.g. Claude Desktop):
```json
{ "mcpServers": { "msteams-mcp": { "command": "node", "args": ["/path/to/msteamsMCP/src/cli.mjs", "start", "--stdio"],
  "env": { "TENANT_ID": "…", "CLIENT_ID": "…" } } }
```

## Logs

Startup prints version, account, app id, scopes and enabled tools. Then one line per request:
```
#12 tools/call get_chat_messages (chatId=19:92b75ebc-6721-4… limit=3) → ok [3 items] · 495 ms · 1.5 KB · user@contoso.com · Visual Studio Code 1.139.1
```
Rejected requests (401/403/404) are logged too. Message content, free-text arguments and tokens are never
logged. `LOG_FILE` writes the same as JSON lines.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `AADSTS50105` not assigned | User not in *Users and groups* of the enterprise app |
| `AADSTS7000218` client_secret required | *Allow public client flows* is not Yes |
| `AADSTS65001` / "Need admin approval" | Tenant blocks user consent → admin consents to exactly these scopes |
| Tool says "run npm run login" | Refresh token expired, or a newly enabled tool needs a new scope |
| 401 in client | Wrong `MCP_ACCESS_TOKEN` (paste the value only, without "Bearer") |
| 403 host not allowed | Use `127.0.0.1:<port>` or `localhost:<port>` |
| Port already in use | Another instance is running |
| VS Code has no MCP commands | VS Code too old; update |

## Update

Review the changes, then `npm ci --ignore-scripts && npm test`, restart, `npm run selftest -- --live`.
Dependency updates: bump exact versions in `package.json`, `npm install`, review `package-lock.json` diff.

## Remove

`npm run logout` → stop the server → remove the client configuration → disable or delete the Entra app.
