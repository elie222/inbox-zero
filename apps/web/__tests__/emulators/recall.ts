import crypto from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A local stand-in for the Recall.ai API, in the spirit of `@inbox-zero/emulate`
 * but kept in-repo because Recall is too niche to belong in that package.
 *
 * It is stateful rather than a mock: bots are created, advance through the real
 * status codes, hold a transcript behind a short-lived download URL, and reject
 * unauthenticated calls. That is enough to exercise `RecallBotProvider` over
 * real HTTP instead of asserting on a `fetch` spy.
 *
 * Fidelity caveat: the payload shapes here are our reading of Recall's docs, so
 * this catches regressions in our client, not a misreading of their API. Update
 * it from real responses whenever we learn something new.
 */

const API_PREFIX = "/api/v1";
const DEFAULT_API_KEY = "emulator-recall-key";
const DEFAULT_WEBHOOK_SECRET = `whsec_${Buffer.from("emulator-recall-webhook").toString("base64")}`;

interface RecallEmulatorBot {
  bot_name: string;
  id: string;
  join_at: string | null;
  media_deleted: boolean;
  meeting_url: string;
  recording_id: string;
  status_changes: Array<{ code: string; sub_code: string | null }>;
  transcript_id: string | null;
}

interface TranscriptWord {
  end_timestamp: { relative: number };
  start_timestamp: { relative: number };
  text: string;
}

export interface RecallEmulatorTranscriptTurn {
  participant: {
    id: string | number;
    name: string | null;
    is_host: boolean;
    email: string | null;
  };
  words: TranscriptWord[];
}

interface RecallEmulatorRequest {
  authorization: string | null;
  body: unknown;
  method: string;
  path: string;
}

export interface RecallEmulator {
  /** Push the bot to the next lifecycle code, as Recall would during a call. */
  advance(botId: string, code: string, subCode?: string): void;
  apiBase: string;
  apiKey: string;
  /**
   * Queue the transcript a recording will yield. It is only produced once
   * `create_transcript` has been called for that recording, mirroring Recall's
   * async flow, and the returned id is what `transcript.done` carries.
   */
  attachTranscript(
    botId: string,
    turns: RecallEmulatorTranscriptTurn[],
  ): string;
  close(): Promise<void>;
  getBot(botId: string): RecallEmulatorBot | undefined;
  rejectNextJoinAtUpdate(): void;
  rejectNextLeaveCallAsUnstarted(): void;
  requests: RecallEmulatorRequest[];
  reset(): void;
  /** Build the Svix-signed request Recall would POST to our webhook route. */
  signWebhook(payload: unknown, overrides?: SignWebhookOverrides): Request;
  /** Whether async transcription was requested for this bot's recording. */
  transcriptRequested(botId: string): boolean;
  url: string;
  webhookSecret: string;
}

interface SignWebhookOverrides {
  id?: string;
  secret?: string;
  timestamp?: number;
}

export async function createRecallEmulator({
  port = 0,
  apiKey = DEFAULT_API_KEY,
  webhookSecret = DEFAULT_WEBHOOK_SECRET,
}: {
  port?: number;
  apiKey?: string;
  webhookSecret?: string;
} = {}): Promise<RecallEmulator> {
  const bots = new Map<string, RecallEmulatorBot>();
  // Queued when a test attaches one; moved to produced only once
  // create_transcript has been called, so a client that never asks for
  // transcription never sees a transcript.
  const pendingTranscripts = new Map<string, RecallEmulatorTranscriptTurn[]>();
  const producedTranscripts = new Map<string, RecallEmulatorTranscriptTurn[]>();
  const recordingToBot = new Map<string, string>();
  const requests: RecallEmulatorRequest[] = [];
  let nextId = 1;
  let rejectNextJoinAtUpdate = false;
  let rejectNextLeaveCallAsUnstarted = false;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const { status, body } = route({
        method: req.method ?? "GET",
        path: new URL(req.url ?? "/", "http://localhost").pathname,
        rawBody,
        authorization: req.headers.authorization ?? null,
      });

      if (body === undefined) {
        res.writeHead(status);
        res.end();
        return;
      }

      const json = JSON.stringify(body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(json);
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  function route({
    method,
    path,
    rawBody,
    authorization,
  }: {
    method: string;
    path: string;
    rawBody: string;
    authorization: string | null;
  }): { status: number; body?: unknown } {
    const body = rawBody ? safeJsonParse(rawBody) : undefined;
    requests.push({ method, path, body, authorization });

    // The transcript download is a presigned URL, so it carries no auth header.
    const download = /^\/download\/([^/]+)$/.exec(path);
    if (download && method === "GET") {
      const turns = producedTranscripts.get(download[1] as string);
      if (!turns) return { status: 404, body: { detail: "Not found." } };
      return { status: 200, body: turns };
    }

    if (authorization !== `Token ${apiKey}`) {
      return {
        status: 401,
        body: { detail: "Invalid token." },
      };
    }

    if (!path.startsWith(API_PREFIX)) {
      return { status: 404, body: { detail: "Not found." } };
    }
    const apiPath = path.slice(API_PREFIX.length);

    if (apiPath === "/bot/" && method === "POST") {
      return createBot(body);
    }

    const deleteMedia = /^\/bot\/([^/]+)\/delete_media\/$/.exec(apiPath);
    if (deleteMedia && method === "POST") {
      const bot = bots.get(deleteMedia[1] as string);
      if (!bot) return { status: 404, body: { detail: "Not found." } };
      bot.media_deleted = true;
      return { status: 200, body: {} };
    }

    const leaveCall = /^\/bot\/([^/]+)\/leave_call\/$/.exec(apiPath);
    if (leaveCall && method === "POST") {
      const botId = leaveCall[1] as string;
      const bot = bots.get(botId);
      if (rejectNextLeaveCallAsUnstarted) {
        rejectNextLeaveCallAsUnstarted = false;
        return {
          status: 400,
          body: { code: "cannot_command_unstarted_bot" },
        };
      }
      if (!bot) {
        return {
          status: 400,
          body: { code: "cannot_command_completed_bot" },
        };
      }
      if (isScheduled(bot)) {
        return {
          status: 400,
          body: { code: "cannot_command_unstarted_bot" },
        };
      }
      bots.delete(botId);
      return { status: 200, body: {} };
    }

    const createTranscript = /^\/recording\/([^/]+)\/create_transcript\/$/.exec(
      apiPath,
    );
    if (createTranscript && method === "POST") {
      return startTranscription(createTranscript[1] as string, body);
    }

    const botPath = /^\/bot\/([^/]+)\/$/.exec(apiPath);
    if (botPath) {
      return handleBot({ botId: botPath[1] as string, method, body });
    }

    const transcriptPath = /^\/transcript\/([^/]+)\/$/.exec(apiPath);
    if (transcriptPath && method === "GET") {
      const transcriptId = transcriptPath[1] as string;
      if (!producedTranscripts.has(transcriptId)) {
        return { status: 404, body: { detail: "Not found." } };
      }
      return {
        status: 200,
        body: {
          id: transcriptId,
          // Recall hands back a fresh presigned URL on every read.
          data: {
            download_url: `${url}/download/${transcriptId}?expires=${Date.now() + 60_000}`,
          },
        },
      };
    }

    return { status: 404, body: { detail: "Not found." } };
  }

  function createBot(body: unknown): { status: number; body?: unknown } {
    const payload = body as
      | { meeting_url?: string; bot_name?: string; join_at?: string }
      | undefined;

    if (!payload?.meeting_url) {
      return {
        status: 400,
        body: { meeting_url: ["This field is required."] },
      };
    }
    // Recall rejects links it cannot join, and it does so permanently.
    if (!/^https?:\/\//.test(payload.meeting_url)) {
      return {
        status: 400,
        body: { meeting_url: ["Not a valid meeting URL."] },
      };
    }

    const bot: RecallEmulatorBot = {
      id: `bot_${nextId++}`,
      meeting_url: payload.meeting_url,
      bot_name: payload.bot_name ?? "",
      join_at: payload.join_at ?? null,
      status_changes: [{ code: "ready", sub_code: null }],
      media_deleted: false,
      recording_id: `rec_${nextId++}`,
      transcript_id: null,
    };
    bots.set(bot.id, bot);
    recordingToBot.set(bot.recording_id, bot.id);

    return { status: 201, body: serializeBot(bot) };
  }

  function startTranscription(
    recordingId: string,
    body: unknown,
  ): { status: number; body?: unknown } {
    const botId = recordingToBot.get(recordingId);
    const bot = botId ? bots.get(botId) : undefined;
    if (!bot) return { status: 404, body: { detail: "Not found." } };

    const payload = body as { provider?: Record<string, unknown> } | undefined;
    if (!payload?.provider) {
      return { status: 400, body: { provider: ["This field is required."] } };
    }

    const transcriptId = bot.transcript_id;
    if (!transcriptId) {
      // Nothing was queued for this bot, so transcription yields nothing.
      return { status: 200, body: {} };
    }

    const turns = pendingTranscripts.get(transcriptId);
    if (turns) producedTranscripts.set(transcriptId, turns);

    return { status: 200, body: { id: transcriptId } };
  }

  function handleBot({
    botId,
    method,
    body,
  }: {
    botId: string;
    method: string;
    body: unknown;
  }): { status: number; body?: unknown } {
    const bot = bots.get(botId);
    if (!bot) return { status: 404, body: { detail: "Not found." } };

    if (method === "GET") return { status: 200, body: serializeBot(bot) };

    if (method === "PATCH") {
      const payload = body as
        | { join_at?: string; meeting_url?: string }
        | undefined;
      if (!isScheduled(bot)) {
        return {
          status: 400,
          body: {
            code: "update_bot_failed",
            detail: "Only non-dispatched bots can be updated",
          },
        };
      }
      if (payload?.join_at && rejectNextJoinAtUpdate) {
        rejectNextJoinAtUpdate = false;
        return {
          status: 400,
          body: {
            code: "update_bot_failed",
            detail: "Not enough time to launch new bot",
          },
        };
      }
      if (payload?.join_at) bot.join_at = payload.join_at;
      if (payload?.meeting_url) bot.meeting_url = payload.meeting_url;
      return { status: 200, body: serializeBot(bot) };
    }

    if (method === "DELETE") {
      // Recall answers 400 once the bot is in the call: too late to cancel.
      if (!isScheduled(bot)) {
        return {
          status: 400,
          body: {
            code: "cannot_delete_bot",
            detail:
              "Only scheduled bots which have not joined a call can be deleted.",
          },
        };
      }
      bots.delete(botId);
      return { status: 204 };
    }

    return { status: 405, body: { detail: "Method not allowed." } };
  }

  return {
    url,
    apiBase: `${url}${API_PREFIX}`,
    apiKey,
    webhookSecret,
    requests,

    getBot: (botId) => bots.get(botId),

    rejectNextJoinAtUpdate() {
      rejectNextJoinAtUpdate = true;
    },

    rejectNextLeaveCallAsUnstarted() {
      rejectNextLeaveCallAsUnstarted = true;
    },

    advance(botId, code, subCode) {
      const bot = bots.get(botId);
      if (!bot) throw new Error(`Unknown bot ${botId}`);
      bot.status_changes.push({ code, sub_code: subCode ?? null });
    },

    attachTranscript(botId, turns) {
      const bot = bots.get(botId);
      if (!bot) throw new Error(`Unknown bot ${botId}`);
      const transcriptId = `transcript_${nextId++}`;
      pendingTranscripts.set(transcriptId, turns);
      bot.transcript_id = transcriptId;
      return transcriptId;
    },

    transcriptRequested(botId) {
      const bot = bots.get(botId);
      return !!bot?.transcript_id && producedTranscripts.has(bot.transcript_id);
    },

    signWebhook(payload, overrides = {}) {
      const rawBody = JSON.stringify(payload);
      const id = overrides.id ?? `msg_${nextId++}`;
      const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
      const key = Buffer.from(
        (overrides.secret ?? webhookSecret).replace(/^whsec_/, ""),
        "base64",
      );
      const signature = crypto
        .createHmac("sha256", key)
        .update(`${id}.${timestamp}.${rawBody}`)
        .digest("base64");

      return new Request("http://localhost:3000/api/recall/webhook", {
        method: "POST",
        body: rawBody,
        headers: {
          "svix-id": id,
          "svix-timestamp": String(timestamp),
          "svix-signature": `v1,${signature}`,
        },
      });
    },

    reset() {
      bots.clear();
      pendingTranscripts.clear();
      producedTranscripts.clear();
      recordingToBot.clear();
      requests.length = 0;
      nextId = 1;
      rejectNextJoinAtUpdate = false;
      rejectNextLeaveCallAsUnstarted = false;
    },

    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };

  function serializeBot(bot: RecallEmulatorBot) {
    return {
      id: bot.id,
      meeting_url: bot.meeting_url,
      bot_name: bot.bot_name,
      join_at: bot.join_at,
      status_changes: bot.status_changes,
      recordings: [{ id: bot.recording_id, transcript_id: bot.transcript_id }],
    };
  }
}

// A bot that has not started joining yet can still be moved or cancelled.
function isScheduled(bot: RecallEmulatorBot): boolean {
  const latest = bot.status_changes.at(-1)?.code;
  return latest === "ready" || latest === "scheduled";
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Convenience for building the webhook bodies Recall sends. */
export const recallWebhookPayloads = {
  statusChange(botId: string, code: string, subCode?: string) {
    return {
      event: `bot.${code}`,
      data: {
        bot: { id: botId },
        data: { code, sub_code: subCode ?? null },
      },
    };
  },
  recordingDone(botId: string, recordingId: string) {
    return {
      event: "recording.done",
      data: {
        bot: { id: botId },
        recording: { id: recordingId },
        data: { code: "done", sub_code: null },
      },
    };
  },
  transcriptDone(botId: string, transcriptId: string) {
    return {
      event: "transcript.done",
      data: {
        bot: { id: botId },
        transcript: { id: transcriptId },
      },
    };
  },
};
