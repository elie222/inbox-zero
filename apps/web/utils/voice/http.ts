import { VoiceRequestError } from "@/utils/voice/errors";
import { VOICE_REQUEST_TIMEOUT_MS } from "@/utils/voice/limits";

export function voiceDeadline(
  signal: AbortSignal | undefined,
  timeoutMs = VOICE_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

export function speechUploadName(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "speech.m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3"))
    return "speech.mp3";
  if (mimeType.includes("wav")) return "speech.wav";
  if (mimeType.includes("ogg") || mimeType.includes("opus"))
    return "speech.ogg";
  return "speech.webm";
}

export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export function voiceHttpError(
  providerName: string,
  action: string,
  status: number,
  body: unknown,
): VoiceRequestError {
  const detail = extractErrorMessage(body);
  const message = detail
    ? `${providerName} failed while ${action}: ${detail}`
    : `${providerName} failed while ${action} (${status})`;
  return new VoiceRequestError(
    message,
    status >= 400 && status < 600 ? status : 502,
  );
}

export function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof record.message === "string") return record.message;
  return null;
}

export async function transcribeOpenAiCompatible(options: {
  url: string;
  apiKey: string;
  model: string;
  audio: Uint8Array;
  mimeType: string;
  extraFields?: Record<string, string>;
  signal?: AbortSignal;
}): Promise<{ text: string }> {
  const form = new FormData();
  form.set("model", options.model);
  form.set(
    "file",
    new Blob([new Uint8Array(options.audio)], {
      type: options.mimeType || "audio/webm",
    }),
    speechUploadName(options.mimeType),
  );
  for (const [key, value] of Object.entries(options.extraFields ?? {})) {
    form.set(key, value);
  }

  const response = await fetch(options.url, {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}` },
    body: form,
    signal: voiceDeadline(options.signal),
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw voiceHttpError(
      "Voice provider",
      "transcribing",
      response.status,
      body,
    );
  }
  const text = String((body as { text?: unknown } | null)?.text ?? "").trim();
  return { text };
}

export async function postJson(options: {
  url: string;
  apiKey: string;
  body: unknown;
  signal?: AbortSignal;
}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(options.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(options.body),
    signal: voiceDeadline(options.signal),
  });
  return { status: response.status, body: await readJsonBody(response) };
}
