# Security

## Model

msteams-mcp acts **as the signed-in user** (Microsoft Entra delegated permissions) and exposes a small set of
**read-only** tools to a local MCP client. It cannot do more than the user can, and only within the scopes of
the enabled tools.

| Control | How |
|---|---|
| Own app registration | `CLIENT_ID`/`TENANT_ID` required; single tenant; no shared/public client fallback |
| No app-only access | No client secret or certificate; no application permissions |
| Least privilege | Scopes requested = scopes of enabled tools (v0.1: `User.Read`, `Chat.Read`) |
| Who can sign in | Entra *Assignment required = Yes* + assigned users only |
| Only own data | All data calls use `/me/…`; one cached account at a time |
| Read-only | Graph client implements GET only; write tools need `ALLOW_WRITE_TOOLS=true` and do not exist in v0.1 |
| Tool allow-list | Only `ENABLED_TOOLS` are registered; others do not exist for the client |
| Input validation | zod schemas (chat id format, numeric limits, enums) |
| Local-only HTTP | Binds to loopback; refuses other addresses; Host header check (DNS rebinding) |
| Client authentication | Bearer token ≥ 32 chars, constant-time comparison |
| Egress | Only `login.microsoftonline.com` and `graph.microsoft.com`; non-Graph URLs refused |
| Secrets at rest | `.env` and token cache `0600`; token cache directory `0700` |
| Audit | Per-request log without content; Entra sign-in logs |
| Supply chain | 3 MIT dependencies, exact versions, lockfile, `npm ci --ignore-scripts` |

**Data leaving the machine to AI providers is the main organizational risk — see
[docs/DATA-FLOW.md](docs/DATA-FLOW.md).**

## Known limitations

- Tool results (message text) are sent by the MCP client to its AI model; this server cannot control what the
  client or provider does with them.
- Chat content can contain prompt-injection text. With read-only tools the model cannot act in Teams, but it
  may still be misled in its answers.
- The refresh token on disk is a credential for the granted scopes until it expires or is revoked.
- Sensitivity labels / DLP policies are not evaluated by this server; content is returned as Graph returns it.

## Reporting a vulnerability

Please use GitHub **private vulnerability reporting** (Security tab → "Report a vulnerability") or e-mail
anielyavuz@gmail.com. Do not open public issues for security problems.
