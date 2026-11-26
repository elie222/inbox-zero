import { extractOtpCode, isOtpSubject } from "@inboxzero/mail-core/otp";
import type { SyncPage } from "@inboxzero/mail-core/sync";

const MAX_MESSAGE_AGE_MS = 5 * 60_000;

type MailNotification = {
  emailAccountId: string;
  id: string;
  threadId: string;
  title: string;
  body: string;
  otpCode: string | null;
};

type NativeNotification = {
  on(
    event: "click" | "action" | "close" | "failed",
    listener: () => void,
  ): unknown;
  show(): void;
  close(): void;
};

// Keep the baseline in the main process so renderer reloads do not replay mail.
export function createMailNotificationTracker(startedAt = Date.now()) {
  const seen = new Map<string, number>();

  return (payload: unknown, now = Date.now()): MailNotification[] => {
    if (!payload || typeof payload !== "object") return [];
    if (!("emailAccountId" in payload) || !("messages" in payload)) return [];
    const { emailAccountId, messages } = payload;
    if (
      typeof emailAccountId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(emailAccountId) ||
      !Array.isArray(messages) ||
      messages.length > 1000
    )
      return [];

    const cutoff = Math.max(startedAt, now - MAX_MESSAGE_AGE_MS);
    for (const [key, receivedAt] of seen) {
      if (receivedAt <= cutoff) seen.delete(key);
    }
    const notifications: MailNotification[] = [];
    for (const message of messages) {
      if (
        !message ||
        typeof message.id !== "string" ||
        !message.id ||
        message.id.length > 256 ||
        typeof message.threadId !== "string" ||
        !message.threadId ||
        message.threadId.length > 256 ||
        typeof message.from !== "string" ||
        message.from.length > 4096 ||
        typeof message.subject !== "string" ||
        message.subject.length > 16_384 ||
        typeof message.receivedAt !== "number" ||
        !Number.isFinite(message.receivedAt) ||
        message.receivedAt <= cutoff ||
        message.receivedAt > now
      )
        continue;
      const key = JSON.stringify([emailAccountId, message.id]);
      if (seen.has(key)) continue;
      seen.set(key, message.receivedAt);
      const subject = cleanText(message.subject);
      const mail = {
        emailAccountId,
        id: message.id,
        threadId: message.threadId,
        body: subject || "(no subject)",
      };
      if (isOtpSubject(subject)) {
        const otpCode = extractOtpCode([subject]);
        // Anyone can send a code-shaped subject, so the alert keeps the sender.
        notifications.push({
          ...mail,
          body: `${senderName(message.from)}: ${mail.body}`,
          title: otpCode
            ? `Verification code: ${otpCode}`
            : "Verification code",
          otpCode,
        });
      } else {
        notifications.push({
          ...mail,
          title: senderName(message.from),
          otpCode: null,
        });
      }
    }
    return notifications;
  };
}

export function newMailFromSyncPage(page: SyncPage) {
  const changes = page.from.checkpoint ? page.changes : [];
  return {
    emailAccountId: page.session.accountId,
    messages: changes.flatMap((change) => {
      if (change.kind !== "message_patch") return [];
      const { fields } = change;
      if (
        change.key.accountId !== page.session.accountId ||
        fields.read !== false ||
        !fields.roles?.includes("inbox") ||
        fields.roles.includes("sent") ||
        fields.roles.includes("draft") ||
        fields.roles.includes("trash") ||
        fields.roles.includes("spam") ||
        fields.receivedAtMs === undefined ||
        fields.from === undefined ||
        fields.subject === undefined
      )
        return [];
      return [
        {
          id: change.key.messageId,
          threadId: change.reference.conversationId,
          receivedAt: fields.receivedAtMs,
          from: fields.from,
          subject: fields.subject,
        },
      ];
    }),
  };
}

export function createMailNotifier(input: {
  origin: string;
  startedAt?: number;
  isFocused: () => boolean;
  isSupported: () => boolean;
  createNotification: (options: {
    title: string;
    body: string;
    actions?: { type: "button"; text: string }[];
  }) => NativeNotification;
  openWindow: (url: string, options: { navigate: boolean }) => unknown;
  copyText: (text: string) => void;
}) {
  const track = createMailNotificationTracker(input.startedAt);
  const active = new Set<NativeNotification>();
  return {
    notify(payload: unknown, now = Date.now()) {
      const messages = track(payload, now);
      if (input.isFocused() || !input.isSupported()) return;
      for (const mail of messages) {
        const { otpCode } = mail;
        const notification = input.createNotification({
          title: mail.title,
          body: mail.body,
          ...(otpCode
            ? { actions: [{ type: "button", text: "Copy code" }] }
            : {}),
        });
        active.add(notification);
        if (otpCode) {
          // Copying on click, not on arrival, keeps whatever the user had on
          // the clipboard until they ask for the code.
          const copy = () => input.copyText(otpCode);
          notification.on("click", copy);
          notification.on("action", copy);
        } else {
          notification.on("click", () => {
            const url = new URL(`/${mail.emailAccountId}/mail`, input.origin);
            url.searchParams.set("thread-id", mail.threadId);
            input.openWindow(url.toString(), { navigate: true });
          });
        }
        const release = () => {
          active.delete(notification);
        };
        notification.on("close", release);
        notification.on("failed", release);
        notification.show();
      }
    },
    close() {
      for (const notification of active) notification.close();
      active.clear();
    },
  };
}

function cleanText(value: string) {
  return value.replace(/\p{Cc}/gu, " ").trim();
}

function senderName(from: string) {
  const value = cleanText(from);
  const match = /^(.*?)\s*<([^<>]+)>$/u.exec(value);
  if (!match) return value;
  return match[1].replace(/^"|"$/gu, "").trim() || match[2].trim();
}
