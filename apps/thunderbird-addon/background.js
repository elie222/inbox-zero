const DEFAULTS = {
  baseUrl: "http://localhost:3000",
  secret: "",
  enabled: true,
  pollSeconds: 15,
};

let pollTimer = null;
const processedKeys = new Set();
const POLL_ALARM = "inbox-zero-bridge-poll";
const CATCHUP_ALARM = "inbox-zero-bridge-catchup";

browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.get(DEFAULTS).then((settings) => {
    return browser.storage.local.set({ ...DEFAULTS, ...settings });
  });
  restartPollTimer();
});

browser.runtime.onStartup.addListener(() => {
  restartPollTimer();
});

if (browser.alarms?.onAlarm) {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== POLL_ALARM && alarm.name !== CATCHUP_ALARM) return;
    pollAndApplyActions().catch((error) => {
      console.error("Action poll failed", error);
    });
  });
}

// When Thunderbird is restored from minimize, catch up immediately.
if (browser.windows?.onFocusChanged) {
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) return;
    pollAndApplyActions().catch((error) => {
      console.error("Focus catch-up poll failed", error);
    });
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "settings-updated") {
    restartPollTimer();
    return Promise.resolve({ ok: true });
  }
  if (message?.type === "register-accounts") {
    return registerAccounts();
  }
  if (message?.type === "process-unread") {
    return processUnreadInbox();
  }
  if (message?.type === "process-recent") {
    return processRecentInbox(message.limit || 25);
  }
  if (message?.type === "test-connection") {
    return testConnection();
  }
  if (message?.type === "poll-actions") {
    return pollAndApplyActions();
  }
  if (message?.type === "get-status") {
    return getBridgeStatus();
  }
  return undefined;
});

if (browser.messages?.onNewMailReceived) {
  browser.messages.onNewMailReceived.addListener(async (_folder, messages) => {
    const settings = await getSettings();
    if (!settings.enabled) return;

    const list = messages?.messages || [];
    for (const header of list) {
      try {
        await processMessageHeader(header, settings);
      } catch (error) {
        console.error("Failed to process new mail", error);
        notify("Inbox Zero Bridge error", String(error));
      }
    }

    await pollAndApplyActions(settings);
  });
}

async function getSettings() {
  return browser.storage.local.get(DEFAULTS);
}

function authHeaders(secret) {
  return {
    "Content-Type": "application/json",
    "x-thunderbird-bridge-secret": secret,
    "x-api-key": secret,
  };
}

async function api(settings, path, options = {}) {
  if (!settings.secret) {
    throw new Error("Bridge secret is not set. Open add-on settings.");
  }
  const response = await fetch(`${settings.baseUrl}${path}`, {
    ...options,
    headers: {
      ...authHeaders(settings.secret),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || `HTTP ${response.status}: ${text}`,
    );
  }
  return data;
}

async function registerAccounts() {
  const settings = await getSettings();
  const accounts = await browser.accounts.list(true);
  const results = [];

  for (const account of accounts) {
    if (account.type === "none") continue;
    const identity = account.identities?.[0];
    const email = identity?.email;
    if (!email) continue;

    const result = await api(settings, "/api/thunderbird/accounts", {
      method: "POST",
      body: JSON.stringify({
        email,
        thunderbirdAccountId: account.id,
        displayName: identity.name || account.name || email,
      }),
    });
    results.push(result);
  }

  notify("Inbox Zero Bridge", `Registered ${results.length} account(s).`);
  return results;
}

async function processUnreadInbox() {
  return processInboxMessages({ unreadOnly: true, limit: 40 });
}

async function processRecentInbox(limit = 25) {
  return processInboxMessages({ unreadOnly: false, limit });
}

async function processInboxMessages({ unreadOnly, limit }) {
  const settings = await getSettings();
  if (!settings.secret) {
    throw new Error("Bridge secret is not set. Open add-on settings.");
  }

  const accounts = await browser.accounts.list(true);
  let processed = 0;
  let failed = 0;
  let found = 0;
  let skippedOld = 0;
  const errors = [];
  const subjects = [];
  const maxAgeMs = 1000 * 60 * 60 * 24 * 14; // ignore mail older than 14 days for "recent"
  const cutoff = Date.now() - maxAgeMs;

  // Allow re-processing if a prior attempt failed (dedupe previously blocked retries).
  processedKeys.clear();

  for (const account of accounts) {
    const inbox = findInboxFolder(account);
    if (!inbox) continue;

    const query = { folderId: inbox.id };
    if (unreadOnly) query.unread = true;

    const page = await browser.messages.query(query);
    let headers = page.messages || [];

    if (!unreadOnly) {
      headers = headers
        .filter((header) => {
          const time = header.date ? new Date(header.date).getTime() : Date.now();
          if (Number.isFinite(time) && time < cutoff) {
            skippedOld += 1;
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const at = a.date ? new Date(a.date).getTime() : 0;
          const bt = b.date ? new Date(b.date).getTime() : 0;
          return bt - at;
        });
    }

    headers = headers.slice(0, limit);
    found += headers.length;

    for (const header of headers) {
      try {
        await processMessageHeader(header, settings);
        processed += 1;
        if (header.subject) subjects.push(header.subject);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        console.error("Failed to process message", error);
      }
    }
  }

  const actions = await pollAndApplyActions(settings);
  const summary = unreadOnly
    ? `Found ${found} unread; processed ${processed}${failed ? `, ${failed} failed` : ""}.`
    : `Found ${found} recent (≤14d); processed ${processed}${skippedOld ? `, skipped ${skippedOld} older` : ""}${failed ? `, ${failed} failed` : ""}.`;

  notify("Inbox Zero Bridge", summary);
  return {
    ok: failed === 0,
    found,
    processed,
    failed,
    skippedOld,
    errors: errors.slice(0, 5),
    subjects: subjects.slice(0, 5),
    actions,
    reviewHint:
      processed > 0
        ? "Open Inbox Zero → switch to your Thunderbird mailbox → Assistant → Pending"
        : unreadOnly
          ? "No unread mail. Try Process recent mail, or mark a message unread first."
          : skippedOld > 0
            ? "Only older mail was found (>14 days). Mark something recent unread, or lower the age filter later."
            : "No messages found in Inbox folders.",
  };
}

async function testConnection() {
  const settings = await getSettings();
  if (!settings.secret) {
    throw new Error("Bridge secret is not set. Open add-on settings.");
  }

  const accounts = await browser.accounts.list(false);
  const emails = accounts
    .map((account) => account.identities?.[0]?.email)
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error("No Thunderbird account identities found.");
  }

  const results = [];
  for (const email of emails) {
    const pending = await api(
      settings,
      `/api/thunderbird/actions?email=${encodeURIComponent(email)}`,
    );
    results.push({
      email,
      ok: true,
      pendingActions: (pending.actions || []).length,
    });
  }

  return {
    ok: true,
    baseUrl: settings.baseUrl,
    accounts: results,
    message: `Connected to ${settings.baseUrl}. Polling ${results.length} account(s).`,
  };
}

async function getBridgeStatus() {
  const settings = await getSettings();
  const accounts = await browser.accounts.list(false);
  return {
    baseUrl: settings.baseUrl,
    hasSecret: Boolean(settings.secret),
    enabled: settings.enabled,
    pollSeconds: settings.pollSeconds,
    accountEmails: accounts
      .map((account) => account.identities?.[0]?.email)
      .filter(Boolean),
  };
}

async function processMessageHeader(header, settings = null) {
  const resolvedSettings = settings || (await getSettings());
  const dedupeKey = `${header.folder?.accountId || "?"}:${header.id}`;
  if (processedKeys.has(dedupeKey)) return null;

  const account = await browser.accounts.get(header.folder.accountId);
  const identity = account?.identities?.[0];
  const accountEmail = identity?.email;
  if (!accountEmail) {
    throw new Error(`No identity email for account ${header.folder.accountId}`);
  }

  const full = await browser.messages.getFull(header.id);
  const parts = flattenParts(full.parts || []);
  const textPlain =
    parts.find((part) => part.contentType?.startsWith("text/plain"))?.body ||
    "";
  const textHtml =
    parts.find((part) => part.contentType?.startsWith("text/html"))?.body || "";
  const listUnsubscribe = extractHeaderValue(full, "list-unsubscribe");

  const payload = {
    accountEmail,
    thunderbirdAccountId: header.folder.accountId,
    thunderbirdMessageId: header.id,
    folderPath: header.folder.path,
    folderId: header.folder.id,
    subject: header.subject || "",
    from: header.author || "",
    to: (header.recipients || []).join(", "),
    cc: (header.ccList || []).join(", "),
    date: header.date ? new Date(header.date).toISOString() : undefined,
    textPlain,
    textHtml,
    snippet: header.snippet || textPlain.slice(0, 200),
    headerMessageId: header.headerMessageId,
    listUnsubscribe,
    tags: header.tags || [],
    read: header.read === true,
    flagged: header.flagged === true,
    isSent: isSentFolder(header.folder),
  };

  const result = await api(resolvedSettings, "/api/thunderbird/process", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  // Only mark processed after a successful API response.
  processedKeys.add(dedupeKey);

  // Actions are held for UI review (Assistant → Pending) — do not auto-apply here.
  // Approved actions are applied via the poll timer.
  if (result.reviewUrl) {
    console.log("Review in UI:", result.reviewUrl, {
      inboxItemId: result.inboxItemId,
      proposedActionCount: result.proposedActionCount,
    });
  }

  return result;
}

function flattenParts(parts) {
  const out = [];
  for (const part of parts) {
    if (part.body) out.push(part);
    if (part.parts?.length) out.push(...flattenParts(part.parts));
  }
  return out;
}

function extractHeaderValue(full, headerName) {
  const headers = full?.headers;
  if (!headers) return undefined;
  const needle = String(headerName).toLowerCase();

  if (typeof headers.get === "function") {
    const value = headers.get(needle) || headers.get(headerName);
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string") return value;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() !== needle) continue;
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function findInboxFolder(account) {
  const walk = (folders = []) => {
    for (const folder of folders) {
      if (folder.type === "inbox") return folder;
      const nested = walk(folder.subFolders || []);
      if (nested) return nested;
    }
    return null;
  };
  return walk(account.folders || []);
}

function isSentFolder(folder) {
  return folder?.type === "sent";
}

async function pollAndApplyActions(settings = null) {
  const resolvedSettings = settings || (await getSettings());
  const accounts = await browser.accounts.list(false);
  let applied = 0;

  for (const account of accounts) {
    const identity = account.identities?.[0];
    const email = identity?.email;
    if (!email) continue;

    const pending = await api(
      resolvedSettings,
      `/api/thunderbird/actions?email=${encodeURIComponent(email)}`,
    );
    const actions = pending.actions || [];
    if (!actions.length) continue;

    await applyActions(actions, email, resolvedSettings);
    applied += actions.length;
  }

  return { applied };
}

async function applyActions(actions, accountEmail, settings) {
  const appliedIds = [];

  for (const action of actions) {
    try {
      await applyOneAction(action);
      appliedIds.push(action.id);
    } catch (error) {
      console.error("Failed to apply action", action, error);
    }
  }

  if (appliedIds.length > 0) {
    await api(settings, "/api/thunderbird/actions", {
      method: "POST",
      body: JSON.stringify({ email: accountEmail, actionIds: appliedIds }),
    });
  }
}

async function applyBulkFromSenders(action, mode) {
  const fromEmails = action.fromEmails || [];
  if (!fromEmails.length) return;

  const accountId = action.thunderbirdAccountId;
  let total = 0;
  const MAX_PER_SENDER = 500;

  for (const fromEmail of fromEmails) {
    const needle = String(fromEmail).toLowerCase();
    const messageIds = [];
    let list = await browser.messages.query({ author: fromEmail });

    while (list) {
      for (const header of list.messages || []) {
        if (accountId && header.folder?.accountId !== accountId) continue;
        const author = String(header.author || "").toLowerCase();
        if (!author.includes(needle)) continue;
        messageIds.push(header.id);
        if (messageIds.length >= MAX_PER_SENDER) break;
      }
      if (messageIds.length >= MAX_PER_SENDER) break;
      if (!list.id || !browser.messages.continueList) break;
      list = await browser.messages.continueList(list.id);
    }

    if (!messageIds.length) continue;

    const chunkSize = 40;
    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const chunk = messageIds.slice(i, i + chunkSize);
      if (mode === "trash") {
        await browser.messages.delete(chunk, true);
      } else {
        await archiveMessages(chunk);
      }
    }
    total += messageIds.length;
  }

  notify(
    "Inbox Zero Bridge",
    mode === "trash"
      ? `Bulk deleted ${total} message(s) from ${fromEmails.length} sender(s).`
      : `Bulk archived ${total} message(s) from ${fromEmails.length} sender(s).`,
  );
}

async function archiveMessages(messageIds) {
  if (!messageIds.length) return;
  if (browser.messages.archive) {
    await browser.messages.archive(messageIds);
    return;
  }

  const byAccount = new Map();
  for (const messageId of messageIds) {
    const header = await browser.messages.get(messageId);
    const accountKey = header.folder?.accountId || "unknown";
    if (!byAccount.has(accountKey)) byAccount.set(accountKey, []);
    byAccount.get(accountKey).push(messageId);
  }

  for (const [accountKey, ids] of byAccount.entries()) {
    const account = await browser.accounts.get(accountKey);
    const archiveFolder =
      findFolderByType(account, "archives") ||
      findFolderByName(account, "Archives") ||
      findFolderByName(account, "Archive");
    if (!archiveFolder) {
      throw new Error(`Archive folder not found for account ${accountKey}`);
    }
    await browser.messages.move(ids, archiveFolder);
  }
}

async function applyOneAction(action) {
  const messageId = action.thunderbirdMessageId;
  switch (action.type) {
    case "bulk_archive":
      await applyBulkFromSenders(action, "archive");
      return;
    case "bulk_trash":
      await applyBulkFromSenders(action, "trash");
      return;
    case "archive": {
      if (!messageId) return;
      await archiveMessages([messageId]);
      return;
    }
    case "trash": {
      if (!messageId) return;
      await browser.messages.delete([messageId], true);
      return;
    }
    case "mark_read": {
      if (!messageId) return;
      await browser.messages.update(messageId, { read: action.read !== false });
      return;
    }
    case "star": {
      if (!messageId) return;
      await browser.messages.update(messageId, { flagged: true });
      return;
    }
    case "mark_spam": {
      if (!messageId) return;
      await browser.messages.update(messageId, { junk: true });
      return;
    }
    case "label": {
      if (!messageId || !action.labelName) return;
      const tagKey = await ensureTag(action.labelName);
      const header = await browser.messages.get(messageId);
      const tags = new Set(header.tags || []);
      tags.add(tagKey || action.labelName);
      await browser.messages.update(messageId, { tags: [...tags] });
      return;
    }
    case "move_folder": {
      if (!messageId || !action.folderName || !action.thunderbirdAccountId) {
        return;
      }
      const account = await browser.accounts.get(action.thunderbirdAccountId);
      const folder = findFolderByName(account, action.folderName);
      if (!folder) {
        throw new Error(`Folder not found: ${action.folderName}`);
      }
      await browser.messages.move([messageId], folder);
      return;
    }
    case "draft":
    case "reply": {
      if (!messageId) return;
      const tab = await browser.compose.beginReply(messageId, "replyToSender");
      if (tab?.id == null) return;

      const details = {
        plainTextBody: action.content || "",
        isPlainText: true,
      };
      if (action.to) details.to = action.to;
      if (action.cc) details.cc = action.cc;
      if (action.bcc) details.bcc = action.bcc;
      if (action.subject) details.subject = action.subject;

      await browser.compose.setComposeDetails(tab.id, details);

      // Prefer saving as draft so the compose window does not interrupt.
      if (browser.compose.saveMessage) {
        await browser.compose.saveMessage(tab.id, { mode: "draft" });
        if (browser.tabs?.remove) await browser.tabs.remove(tab.id);
      }
      return;
    }
    case "send": {
      const tab = await browser.compose.beginNew({
        to: action.to,
        subject: action.subject,
        plainTextBody: action.content,
        isPlainText: true,
        cc: action.cc,
        bcc: action.bcc,
      });
      if (tab?.id != null && browser.compose.saveMessage) {
        await browser.compose.saveMessage(tab.id, { mode: "draft" });
        if (browser.tabs?.remove) await browser.tabs.remove(tab.id);
      }
      return;
    }
    case "forward": {
      if (!messageId) return;
      const tab = await browser.compose.beginForward(messageId, "forwardInline");
      if (tab?.id == null) return;
      await browser.compose.setComposeDetails(tab.id, {
        to: action.to,
        plainTextBody: action.content || "",
        isPlainText: true,
      });
      return;
    }
    default:
      console.warn("Unknown Thunderbird bridge action", action.type);
  }
}

async function ensureTag(tagName) {
  if (!browser.messages.tags?.list) return tagName;
  const key = String(tagName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
  if (!key) return tagName;

  const tags = await browser.messages.tags.list();
  const existing = tags.find(
    (tag) =>
      tag.key === key ||
      tag.key === tagName ||
      tag.tag === tagName ||
      tag.tag === key,
  );
  if (existing) return existing.key || key;
  if (browser.messages.tags.create) {
    await browser.messages.tags.create(key, tagName, "#5b8def");
  }
  return key;
}

function findFolderByName(account, folderName) {
  const target = folderName.toLowerCase();
  const walk = (folders = []) => {
    for (const folder of folders) {
      if (
        folder.name?.toLowerCase() === target ||
        folder.path?.toLowerCase().endsWith(`/${target}`) ||
        folder.path?.toLowerCase() === target
      ) {
        return folder;
      }
      const nested = walk(folder.subFolders || []);
      if (nested) return nested;
    }
    return null;
  };
  return walk(account.folders || []);
}

function findFolderByType(account, folderType) {
  const walk = (folders = []) => {
    for (const folder of folders) {
      if (folder.type === folderType) return folder;
      const nested = walk(folder.subFolders || []);
      if (nested) return nested;
    }
    return null;
  };
  return walk(account.folders || []);
}

function notify(title, message) {
  if (!browser.notifications?.create) return;
  browser.notifications.create({
    type: "basic",
    title,
    message: String(message).slice(0, 180),
  });
}

async function restartPollTimer() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const settings = await getSettings();
  const seconds = Math.max(5, Number(settings.pollSeconds) || 15);
  const periodInMinutes = Math.max(seconds / 60, 0.1);

  // Alarms keep waking the add-on even when Thunderbird is minimized.
  // setInterval alone is heavily throttled in the background on Windows.
  if (browser.alarms?.create) {
    await browser.alarms.clear(POLL_ALARM);
    await browser.alarms.clear(CATCHUP_ALARM);
    await browser.alarms.create(POLL_ALARM, {
      delayInMinutes: periodInMinutes,
      periodInMinutes,
    });
    // Staggered second alarm helps when the OS delays a single timer.
    await browser.alarms.create(CATCHUP_ALARM, {
      delayInMinutes: periodInMinutes / 2,
      periodInMinutes,
    });
  }

  // Keep a lighter in-process interval as a best-effort while TB is foregrounded.
  pollTimer = setInterval(() => {
    pollAndApplyActions().catch((error) => {
      console.error("Action poll failed", error);
    });
  }, seconds * 1000);

  // Immediate catch-up after settings reload / add-on start.
  pollAndApplyActions().catch((error) => {
    console.error("Startup poll failed", error);
  });
}

restartPollTimer();
