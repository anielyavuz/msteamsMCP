// Chat tools (1:1, group and meeting chats of the signed-in user). Delegated Chat.Read.
// Every call goes through /me/... so the result is always limited to the signed-in user's own chats.

import { z } from "zod";
import { summarizeChat, summarizeMessage } from "../format.mjs";

const CHAT_ID = /^19:[A-Za-z0-9_\-.@:=+]+$/;   // Teams thread id, e.g. 19:...@thread.v2 / 19:meeting_...@thread.v2

export const listChats = {
  name: "list_chats",
  title: "List my chats",
  description:
    "List the signed-in user's Teams chats (1:1, group, meeting), most recently active first, with members and a short preview of the last message.",
  access: "read",
  scopes: ["Chat.Read"],
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of chats (1-50)"),
    chatType: z.enum(["oneOnOne", "group", "meeting"]).optional().describe("Only this chat type"),
    topicContains: z.string().max(100).optional().describe("Case-insensitive filter on chat topic or member names"),
  },
  async handler({ limit = 20, chatType, topicContains }, { graph }) {
    const needle = topicContains?.toLocaleLowerCase();
    const filtering = Boolean(chatType || needle);
    const { items, truncated } = await graph.getPaged(
      "/me/chats?$expand=members,lastMessagePreview&$orderby=lastMessagePreview/createdDateTime desc&$top=50",
      { max: filtering ? 500 : limit, maxPages: filtering ? 10 : 2 }
    );
    const chats = items
      .map((c) => summarizeChat(c))
      .filter((c) => !chatType || c.chatType === chatType)
      .filter((c) => !needle || [c.topic || "", ...c.members].some((t) => t.toLocaleLowerCase().includes(needle)))
      .slice(0, limit);
    return { count: chats.length, moreAvailable: truncated || undefined, chats };
  },
};

export const getChatMessages = {
  name: "get_chat_messages",
  title: "Read chat messages",
  description:
    "Read messages of one of the signed-in user's chats (use list_chats to get chatId). Newest first by default; optional time window and sender filter. Bodies are returned as plain text.",
  access: "read",
  scopes: ["Chat.Read"],
  inputSchema: {
    chatId: z.string().regex(CHAT_ID, "chatId must be a Teams chat id starting with 19:").describe("Chat id from list_chats"),
    limit: z.number().int().min(1).max(200).default(20).describe("Maximum number of messages (1-200)"),
    since: z.iso.datetime({ offset: true }).optional().describe("Only messages created at/after this ISO time"),
    until: z.iso.datetime({ offset: true }).optional().describe("Only messages created before this ISO time"),
    fromName: z.string().max(100).optional().describe("Case-insensitive filter on sender display name"),
    order: z.enum(["newest", "oldest"]).default("newest").describe("Result order"),
    includeSystemMessages: z.boolean().default(false).describe("Include system events (member added, call started, ...)"),
    format: z.enum(["text", "html"]).default("text").describe("Body as plain text (default) or original HTML"),
  },
  async handler(args, { graph }) {
    const { chatId, limit = 20, since, until, fromName, order = "newest", includeSystemMessages = false, format = "text" } = args;
    const sinceT = since ? Date.parse(since) : undefined;
    const untilT = until ? Date.parse(until) : undefined;
    const who = fromName?.toLocaleLowerCase();
    const keep = (m) =>
      (includeSystemMessages || m.messageType === "message") &&
      (untilT === undefined || Date.parse(m.createdDateTime) < untilT) &&
      (!who || (m.from?.user?.displayName || m.from?.application?.displayName || "").toLocaleLowerCase().includes(who));

    // Graph returns newest first; page until enough matches or the "since" boundary is passed.
    const matched = [];
    const { truncated } = await graph.getPaged(
      `/me/chats/${encodeURIComponent(chatId)}/messages?$top=50&$orderby=createdDateTime desc`,
      {
        max: 5000,
        maxPages: 40,
        stop: (m) => {
          if (sinceT !== undefined && Date.parse(m.createdDateTime) < sinceT) return true;
          if (keep(m)) matched.push(m);
          return matched.length >= limit;
        },
      }
    );
    const messages = matched.map((m) => summarizeMessage(m, { format }));
    if (order === "oldest") messages.reverse();
    return { chatId, count: messages.length, order, moreAvailable: (truncated && matched.length < limit) || undefined, messages };
  },
};
