// Turns raw Graph objects into compact, LLM-friendly JSON (plain text bodies, no HTML noise).

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Teams message HTML → readable plain text (mentions, line breaks, lists, attachments, images). */
export function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<at\b[^>]*>(.*?)<\/at>/gis, (_, name) => `@${name.replace(/<[^>]+>/g, "")}`);
  s = s.replace(/<attachment\b[^>]*id="([^"]*)"[^>]*>\s*<\/attachment>/gi, "[attachment:$1]");
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = /alt="([^"]*)"/i.exec(tag)?.[1];
    return alt ? `[image: ${alt}]` : "[image]";
  });
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, (_, href, text) => {
    const t = text.replace(/<[^>]+>/g, "").trim();
    return t && t !== href ? `${t} (${href})` : href;
  });
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/(p|div|li|ul|ol|tr|h[1-6]|blockquote)>/gi, "\n");
  s = s.replace(/<systemEventMessage\s*\/?>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sender(from) {
  if (!from) return { type: "system", name: "system" };
  if (from.user) return { type: "user", name: from.user.displayName || "?", id: from.user.id };
  if (from.application) return { type: "app", name: from.application.displayName || "app", id: from.application.id };
  if (from.device) return { type: "device", name: from.device.displayName || "device" };
  return { type: "unknown", name: "?" };
}

/** chatMessage → compact object. format "text" (default) or "html" (original body). */
export function summarizeMessage(m, { format = "text" } = {}) {
  const deleted = Boolean(m.deletedDateTime);
  const body = deleted ? "" : format === "html" ? m.body?.content || "" : m.body?.contentType === "html" ? htmlToText(m.body?.content) : (m.body?.content || "").trim();
  const out = {
    id: m.id,
    createdDateTime: m.createdDateTime,
    from: sender(m.from),
    messageType: m.messageType,
    body,
  };
  if (m.subject) out.subject = m.subject;
  if (m.importance && m.importance !== "normal") out.importance = m.importance;
  if (m.lastEditedDateTime) out.editedDateTime = m.lastEditedDateTime;
  if (deleted) out.deleted = true;
  if (m.replyToId) out.replyToId = m.replyToId;
  if (m.attachments?.length) {
    out.attachments = m.attachments.map((a) => ({ id: a.id, name: a.name || null, contentType: a.contentType }));
  }
  if (m.mentions?.length) out.mentions = m.mentions.map((x) => x.mentionText || x.mentioned?.user?.displayName).filter(Boolean);
  if (m.reactions?.length) out.reactions = m.reactions.length;
  return out;
}

/** chat (with $expand=members,lastMessagePreview) → compact object. */
export function summarizeChat(c, { maxMembers = 20 } = {}) {
  const members = (c.members || []).map((x) => x.displayName || x.email || "?");
  const out = {
    id: c.id,
    chatType: c.chatType,
    topic: c.topic || null,
    createdDateTime: c.createdDateTime,
    lastUpdatedDateTime: c.lastUpdatedDateTime,
    memberCount: members.length,
    members: members.slice(0, maxMembers),
  };
  if (members.length > maxMembers) out.membersTruncated = true;
  const p = c.lastMessagePreview;
  if (p) {
    const text = p.isDeleted ? "" : p.body?.contentType === "html" ? htmlToText(p.body?.content) : (p.body?.content || "");
    out.lastMessage = {
      createdDateTime: p.createdDateTime,
      from: p.from?.user?.displayName || p.from?.application?.displayName || null,
      preview: text.length > 200 ? `${text.slice(0, 200)}…` : text,
    };
  }
  return out;
}
