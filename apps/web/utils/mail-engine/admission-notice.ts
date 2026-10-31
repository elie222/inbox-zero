export function admissionRejectionCopy(code: string | undefined) {
  if (code === "queue_full") {
    return "Mail is full of pending actions. Wait for some to finish, then try again.";
  }
  if (code === "too_large" || code === "storage_unavailable") {
    return "This device does not have enough storage for that mail action.";
  }
}
