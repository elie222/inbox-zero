export class VoiceUnavailableError extends Error {
  readonly reason: "disabled" | "provider" | "capability" | "key";

  constructor(
    reason: "disabled" | "provider" | "capability" | "key",
    message: string,
  ) {
    super(message);
    this.name = "VoiceUnavailableError";
    this.reason = reason;
  }
}

export class VoiceRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "VoiceRequestError";
    this.status = status;
  }
}
