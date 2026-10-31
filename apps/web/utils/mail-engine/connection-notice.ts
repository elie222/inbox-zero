export function mailEngineConnectionCopy(
  connection: "ready" | "offline" | "blocked_auth" | undefined,
) {
  if (connection === "blocked_auth") {
    return {
      title: "Reconnect this account to continue syncing.",
      description:
        "Mailbox catch-up is paused until this account is reconnected.",
      action: "Reconnect",
    };
  }
  if (connection === "offline") {
    return {
      title: "Waiting to sync.",
      description: "Catch-up will retry automatically.",
    };
  }
}
