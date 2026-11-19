import { SafeError } from "@/utils/error";

export class MobileSocialAuthRateLimitError extends SafeError {
  private readonly retryAfter: string | null;

  constructor(retryAfter: string | null) {
    super("Too many sign-in attempts. Please try again later.", 429);
    this.retryAfter = retryAfter;
  }

  toResponse() {
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (this.retryAfter) headers.set("Retry-After", this.retryAfter);
    return Response.json(
      { error: this.safeMessage, isKnownError: true },
      { status: this.statusCode, headers },
    );
  }
}
