export function isGmailMessageNotFoundError(error: unknown): boolean {
  const err = error as {
    code?: unknown;
    status?: unknown;
    response?: {
      status?: unknown;
      data?: {
        error?: {
          code?: unknown;
          status?: unknown;
          message?: unknown;
          errors?: Array<{ reason?: unknown; message?: unknown }>;
        };
      };
    };
    message?: unknown;
  };

  const code =
    err.response?.data?.error?.code ??
    err.response?.status ??
    err.status ??
    err.code;
  if (code === 404 || code === "404") return true;

  const status = err.response?.data?.error?.status;
  if (status === "NOT_FOUND") return true;

  const reasons = err.response?.data?.error?.errors?.map((item) => item.reason);
  if (reasons?.includes("notFound")) return true;

  return false;
}
