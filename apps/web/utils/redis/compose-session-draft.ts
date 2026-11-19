import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email/send-operation-policy";
import { redis } from "@/utils/redis";

// A send can be delivered as late as its retry window allows, and the
// session's draft has to be found until then.
const SESSION_TTL_SECONDS = Math.ceil(MAIL_MUTATION_RETRY_WINDOW_MS / 1000);

// Each side writes its own field and reads the other's in one atomic step on
// the primary, so whichever of "draft saved" and "send delivered" happens
// second always sees the first (apps/web/specs/compose-send.qnt, "server").
// Every draft the session saved is kept, since two tabs reopening the same
// reply can each create one.
const RECORD_DRAFT_SCRIPT = `
redis.call("HSET", KEYS[1], "draft:" .. ARGV[1], "1")
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
return redis.call("HGET", KEYS[1], "sent")
`;
const MARK_SENT_SCRIPT = `
redis.call("HSET", KEYS[1], "sent", "1")
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
local drafts = {}
for _, field in ipairs(redis.call("HKEYS", KEYS[1])) do
  if string.sub(field, 1, 6) == "draft:" then
    drafts[#drafts + 1] = string.sub(field, 7)
  end
end
return drafts
`;

/** Records the compose session's mailbox draft; true if the session was already sent. */
export async function recordComposeSessionDraft({
  emailAccountId,
  sessionId,
  draftId,
}: {
  emailAccountId: string;
  sessionId: string;
  draftId: string;
}) {
  const sent = await redis.eval<string[], string | null>(
    RECORD_DRAFT_SCRIPT,
    [sessionKey(emailAccountId, sessionId)],
    [draftId, SESSION_TTL_SECONDS.toString()],
  );
  return sent !== null;
}

/** Marks the compose session sent and returns every draft it saved. */
export async function markComposeSessionSent({
  emailAccountId,
  sessionId,
}: {
  emailAccountId: string;
  sessionId: string;
}) {
  const drafts = await redis.eval<string[], string[] | null>(
    MARK_SENT_SCRIPT,
    [sessionKey(emailAccountId, sessionId)],
    [SESSION_TTL_SECONDS.toString()],
  );
  return drafts ?? [];
}

// The account is part of the key, so another account's session id finds nothing.
function sessionKey(emailAccountId: string, sessionId: string) {
  return `compose-session-draft:${emailAccountId}:${sessionId}`;
}
