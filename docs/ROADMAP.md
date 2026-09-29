# Roadmap — future capabilities

v0.1 deliberately does **one thing**: read the signed-in user's own chat messages. The code is built so more
Teams capabilities can be added as separate tools (see `ARCHITECTURE.md` → "Adding a tool"). Each step widens
permissions, so each should be reviewed and enabled on its own.

Rule for every new tool: declare `access` and `scopes`, add the delegated scope to the Entra app, update
`DATA-FLOW.md` (what it returns to the AI), extend `scripts/selftest.mjs`, keep it disabled by default until
reviewed.

## Planned read tools

| Stage | Tool(s) | Graph | Delegated scope(s) | Admin consent | Notes |
|---|---|---|---|---|---|
| 2 | `list_teams`, `list_channels` | `/me/joinedTeams`, `/teams/{id}/channels` | `Team.ReadBasic.All`, `Channel.ReadBasic.All` | Yes | Names only, no messages |
| 2 | `get_channel_messages`, `get_channel_message_replies` | `/teams/{id}/channels/{id}/messages(/replies)` | `ChannelMessage.Read.All` | Yes | Channel content goes to the AI — larger audience than chats |
| 3 | `search_messages`, `get_my_mentions` | `POST /search/query` (entityTypes `chatMessage`) | `Chat.Read`, `ChannelMessage.Read.All` | per scope | Search API uses POST — add an explicit read-only POST in `graph.mjs` |
| 3 | `get_chat_members` | `/me/chats/{id}/members` | `Chat.Read` / `ChatMember.Read` | No | |
| 3 | `download_attachment` (hosted contents) | `/chats/{id}/messages/{id}/hostedContents/{id}/$value` | `Chat.Read` | No | Binary; size limits; images may reach the AI |
| 4 | `list_my_meetings`, `get_meeting_transcript` | `/me/onlineMeetings`, `/me/onlineMeetings/{id}/transcripts` | `OnlineMeetings.Read`, `OnlineMeetingTranscript.Read.All` | Yes | Highly sensitive; legal/HR review recommended |
| 4 | `get_presence` | `/me/presence`, `/communications/getPresencesByUserId` | `Presence.Read(.All)` | No / Yes | |

## Write tools (only after a separate security review)

| Tool | Graph | Scope | Main risk |
|---|---|---|---|
| `send_chat_message` | `POST /chats/{id}/messages` | `ChatMessage.Send` | Prompt injection from read content could make the AI send messages |
| `reply_to_channel_message` | `POST …/messages/{id}/replies` | `ChannelMessage.Send` | Same, wider audience |
| `set_reaction` | `POST …/setReaction` | `Chat.ReadWrite` / `ChannelMessage.ReadWrite` | Low impact |
| `create_chat` | `POST /chats` | `Chat.Create` | Contacts arbitrary people |

Required before any write tool: `ALLOW_WRITE_TOOLS=true`, an explicit write method in `graph.mjs`,
human confirmation in the client for every call, audit log with target ids, and an allow-list of target chats.

## Platform / operations

- Run as a background service (macOS launchd, Windows service, systemd user unit) with automatic restart.
- Optional OS keychain for the token cache instead of a file.
- Per-tool rate limits and maximum result size.
- Optional redaction (e-mail addresses, phone numbers, card-like numbers) before results reach the AI.
- Packaging: `npx` / single binary; container image for managed hosts.
- CI: unit tests + lint + dependency audit on every change.
