# msteams-mcp

A small, self-hosted **MCP server for Microsoft Teams** that lets an AI assistant (VS Code Copilot Chat,
Claude, …) **read your own Teams chats** — with least privilege, on your machine, under your own Entra app.

- **Delegated only** — acts as the signed-in user; sees only what that user sees (`/me/...`).
- **Read-only** — v0.1 has 4 read tools; the Graph client is GET-only.
- **Your own app registration** — single tenant, no secret, no application permissions, assigned users only.
- **Local** — HTTP on `127.0.0.1` with a bearer token (or stdio). No telemetry.
- **Auditable** — one log line per request (account, client, tool, result) without message content.
- **Extensible** — new Teams capabilities are added as separate tools with declared scopes ([roadmap](docs/ROADMAP.md)).

> ⚠️ **Data leaves your machine through your AI client.** Tool results — including Teams message text —
> are sent to the AI model your MCP client uses (usually a cloud service). Review
> **[docs/DATA-FLOW.md](docs/DATA-FLOW.md)** before using it with organizational data.

## Tools (v0.1)

| Tool | What it returns | Scope |
|---|---|---|
| `auth_status` | Which account the server acts as, granted scopes, token expiry | – |
| `get_current_user` | Your profile | `User.Read` |
| `list_chats` | Your chats (1:1, group, meeting), members, last message preview; filter by type / text | `Chat.Read` |
| `get_chat_messages` | Messages of one of your chats as plain text; limit, time window, sender filter, order | `Chat.Read` |

## Quick start

Requirements: Node.js 20+, an Entra app registration ([docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md)).

```bash
git clone https://github.com/anielyavuz/msteamsMCP.git && cd msteamsMCP
npm ci --ignore-scripts
cp .env.example .env && chmod 600 .env      # set TENANT_ID, CLIENT_ID, MCP_ACCESS_TOKEN
npm run login                               # device code sign-in
npm start                                   # http://127.0.0.1:3978/mcp
npm run selftest -- --live                  # second terminal: security + live checks
```

Then add the server to your MCP client ([docs/OPERATIONS.md](docs/OPERATIONS.md#connect-a-client)).

## How it works

```
AI client ──HTTP 127.0.0.1 + Bearer──▶ msteams-mcp ──HTTPS, delegated token──▶ Microsoft Graph (/me/chats…)
    │                                       │
    └──▶ AI model provider (cloud)          └── token cache 0600, audit log (no content)
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (modules, functions, flows, adding a tool).

## Documentation

| Document | For |
|---|---|
| [docs/DATA-FLOW.md](docs/DATA-FLOW.md) | Security/privacy review: what data goes where, incl. the AI provider |
| [SECURITY.md](SECURITY.md) | Controls, limitations, reporting vulnerabilities |
| [docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md) | App registration, permissions, restricting users |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Commands, configuration, clients, logs, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, functions, request and sign-in flows |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned tools and the review rule for each |
| [docs/KURULUM.tr.md](docs/KURULUM.tr.md) | Adım adım kurulum (Türkçe) |

## License

MIT © 2026 Anıl Yavuz. Dependencies: `@modelcontextprotocol/sdk`, `@azure/msal-node`, `zod` (all MIT).

Not affiliated with or endorsed by Microsoft. Microsoft, Microsoft Teams, Microsoft Entra and Microsoft Graph
are trademarks of the Microsoft group of companies.
