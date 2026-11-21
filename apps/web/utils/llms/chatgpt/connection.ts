import { createHash } from "node:crypto";
import { env } from "@/env";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";
import { acquireOwnedLock, clearOwnedLock } from "@/utils/redis/owned-lock";
import {
  CHATGPT_PLAN_SCOPE,
  ChatGptTokenError,
  createChatGptHostId,
  refreshChatGptToken,
  revokeChatGptRefreshToken,
  type ChatGptTokenResponse,
} from "@/utils/llms/chatgpt/oauth";

const CONNECTION_ID = "default";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const RENEWAL_LOCK_KEY = "chatgpt:token-renewal";
const RENEWAL_LOCK_TTL_SECONDS = 30;
const RENEWAL_LOCK_WAIT_MS = 15_000;
const RENEWAL_LOCK_POLL_MS = 500;
const REJECTED_REFRESH_RECHECK_MS = 2000;

const logger = createScopedLogger("llms/chatgpt");

const RECONNECT_HINT =
  "Run `inbox-zero chatgpt login` and restart, or reconnect from the Admin page.";

const NOT_CONNECTED_MESSAGE = `ChatGPT is not connected. ${RECONNECT_HINT}`;
const RENEWAL_UNAVAILABLE_MESSAGE =
  "ChatGPT couldn't renew its sign-in right now. Try again shortly.";

export async function getChatGptRegistration() {
  return prisma.chatGptConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      hostId: env.CHATGPT_HOST_ID ?? createChatGptHostId(),
    },
    update: {},
    select: { hostId: true, clientId: true, idToken: true },
  });
}

export async function getChatGptStatus() {
  const connection = await prisma.chatGptConnection.findUnique({
    where: { id: CONNECTION_ID },
    select: { email: true, refreshToken: true, importedTokenHash: true },
  });
  // A sign-in from setup is imported on first use; until then it only exists
  // in the environment.
  return {
    connected: !!connection?.refreshToken || !!getPendingEnvImport(connection),
    email: connection?.email ?? null,
  };
}

export async function saveChatGptConnection({
  clientId,
  subject,
  email,
  tokens,
}: {
  clientId: string;
  subject: string;
  email: string | null;
  tokens: ChatGptTokenResponse;
}) {
  await prisma.chatGptConnection.update({
    where: { id: CONNECTION_ID },
    data: {
      clientId,
      subject,
      email,
      ...tokenFields(tokens),
      idToken: tokens.id_token ?? null,
    },
  });
}

let pendingRenewal: Promise<string> | null = null;

export async function getChatGptAccessToken(): Promise<string> {
  const row = await loadRow();
  if (!getPendingEnvImport(row)) {
    const connection = toConnection(row);
    if (!connection) throw new SafeError(NOT_CONNECTED_MESSAGE);
    if (isFresh(connection)) return connection.accessToken;
  }

  // Refresh tokens are single-use, so every renewal across processes and
  // bundles is serialized; concurrent ones would spend the same token twice.
  pendingRenewal ??= withRenewalLock(renewUnderLock).finally(() => {
    pendingRenewal = null;
  });
  return pendingRenewal;
}

export async function disconnectChatGpt(): Promise<{ revoked: boolean }> {
  const row = await loadRow();
  const connection = toConnection(row);
  // A setup sign-in not yet imported is only in the environment; marking it
  // imported keeps the next AI call from reconnecting it.
  const envImport = getPendingEnvImport(row);
  const sessions = [connection, envImport].filter((session) => !!session);

  const results = await Promise.all(
    sessions.map((session) =>
      revokeChatGptRefreshToken({
        clientId: session.clientId,
        refreshToken: session.refreshToken,
      }).catch((error) => {
        logger.warn("Failed to revoke ChatGPT session", { error });
        return false;
      }),
    ),
  );

  if (envImport) {
    await upsertConnection({
      ...CLEARED_TOKENS,
      importedTokenHash: envImport.tokenHash,
    });
  } else {
    await clearTokens();
  }
  return { revoked: results.length > 0 && results.every(Boolean) };
}

type LoadedConnection = NonNullable<ReturnType<typeof toConnection>>;
type ConnectionRow = Awaited<ReturnType<typeof loadRow>>;

async function loadRow() {
  return prisma.chatGptConnection.findUnique({
    where: { id: CONNECTION_ID },
    select: {
      clientId: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      importedTokenHash: true,
    },
  });
}

function toConnection(row: ConnectionRow) {
  if (!row?.clientId || !row.accessToken || !row.refreshToken) return null;
  return {
    clientId: row.clientId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
  };
}

function isFresh(connection: LoadedConnection) {
  const expiresAt = connection.expiresAt?.getTime() ?? 0;
  return expiresAt - Date.now() > REFRESH_MARGIN_MS;
}

// Re-reads after taking the lock: whoever held it may have renewed already.
async function renewUnderLock(): Promise<string> {
  const row = await loadRow();
  const envImport = getPendingEnvImport(row);
  if (envImport) return importFromEnv(envImport);

  const connection = toConnection(row);
  if (!connection) throw new SafeError(NOT_CONNECTED_MESSAGE);
  if (isFresh(connection)) return connection.accessToken;
  return refreshConnection(connection);
}

async function withRenewalLock(renew: () => Promise<string>) {
  const deadline = Date.now() + RENEWAL_LOCK_WAIT_MS;
  let lockToken = await tryAcquireRenewalLock();
  while (lockToken === null) {
    // Renewing without the lock here would spend the holder's refresh token.
    if (Date.now() >= deadline)
      throw new SafeError(RENEWAL_UNAVAILABLE_MESSAGE);
    await sleep(RENEWAL_LOCK_POLL_MS);
    const row = await loadRow();
    const connection = toConnection(row);
    if (!getPendingEnvImport(row) && connection && isFresh(connection)) {
      return connection.accessToken;
    }
    lockToken = await tryAcquireRenewalLock();
  }

  try {
    return await renew();
  } finally {
    if (lockToken) {
      await clearOwnedLock({ key: RENEWAL_LOCK_KEY, lockToken }).catch(
        (error) =>
          logger.warn("Failed to release ChatGPT renewal lock", { error }),
      );
    }
  }
}

// Returns null while another process holds the lock, and "" when Redis is
// unreachable, in which case renewal proceeds unserialized rather than failing.
async function tryAcquireRenewalLock(): Promise<string | null> {
  try {
    return await acquireOwnedLock({
      key: RENEWAL_LOCK_KEY,
      processingTtlSeconds: RENEWAL_LOCK_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("ChatGPT renewal lock unavailable", { error });
    return "";
  }
}

async function refreshConnection(
  connection: LoadedConnection,
): Promise<string> {
  try {
    const tokens = await refreshChatGptToken({
      clientId: connection.clientId,
      refreshToken: connection.refreshToken,
    });
    await prisma.chatGptConnection.update({
      where: { id: CONNECTION_ID },
      data: tokenFields(tokens, connection.refreshToken),
    });
    return tokens.access_token;
  } catch (error) {
    if (!(error instanceof ChatGptTokenError)) throw error;
    logTokenError("ChatGPT refresh failed", error);
    if (!error.isTerminal) throw new SafeError(RENEWAL_UNAVAILABLE_MESSAGE);

    // A renewal that ran without the lock (Redis down) may have rotated it.
    await sleep(REJECTED_REFRESH_RECHECK_MS);
    const latest = toConnection(await loadRow());
    if (
      latest &&
      latest.refreshToken !== connection.refreshToken &&
      isFresh(latest)
    ) {
      return latest.accessToken;
    }

    await clearTokens();
    throw new SafeError(
      `The ChatGPT connection expired or was revoked. ${RECONNECT_HINT}`,
    );
  }
}

function logTokenError(message: string, error: ChatGptTokenError) {
  logger.warn(message, {
    status: error.status,
    code: error.code,
    description: error.description,
  });
}

type EnvImport = {
  clientId: string;
  refreshToken: string;
  tokenHash: string;
};

function getPendingEnvImport(
  row: { importedTokenHash: string | null } | null,
): EnvImport | null {
  if (!env.CHATGPT_CLIENT_ID || !env.CHATGPT_REFRESH_TOKEN) return null;
  const tokenHash = createHash("sha256")
    .update(env.CHATGPT_REFRESH_TOKEN)
    .digest("hex");
  if (row?.importedTokenHash === tokenHash) return null;
  return {
    clientId: env.CHATGPT_CLIENT_ID,
    refreshToken: env.CHATGPT_REFRESH_TOKEN,
    tokenHash,
  };
}

// The refresh token from setup is spent on first use, so it is exchanged
// exactly once and the rotated credentials live in the database from then on.
async function importFromEnv(envImport: EnvImport): Promise<string> {
  try {
    const tokens = await refreshChatGptToken({
      clientId: envImport.clientId,
      refreshToken: envImport.refreshToken,
    });
    await upsertConnection({
      clientId: envImport.clientId,
      ...tokenFields(tokens, envImport.refreshToken),
      // Setup refuses sign-ins without plan usage, so the grant is known even
      // when the refresh response omits `scope`.
      scope: tokens.scope ?? CHATGPT_PLAN_SCOPE,
      email: readUnverifiedEmail(tokens.id_token),
      importedTokenHash: envImport.tokenHash,
    });
    logger.info("Imported ChatGPT sign-in from setup");
    return tokens.access_token;
  } catch (error) {
    if (!(error instanceof ChatGptTokenError)) throw error;
    logTokenError("ChatGPT sign-in from setup could not be imported", error);
    if (!error.isTerminal) throw new SafeError(RENEWAL_UNAVAILABLE_MESSAGE);

    await upsertConnection({ importedTokenHash: envImport.tokenHash });
    throw new SafeError(
      `The ChatGPT sign-in from setup has expired or was revoked. ${RECONNECT_HINT}`,
    );
  }
}

// Display only: this token came straight from OpenAI's token endpoint.
function readUnverifiedEmail(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

function tokenFields(
  tokens: ChatGptTokenResponse,
  previousRefreshToken?: string,
) {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefreshToken ?? null,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
  };
}

const CLEARED_TOKENS = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
};

async function clearTokens() {
  await prisma.chatGptConnection.updateMany({
    where: { id: CONNECTION_ID },
    data: CLEARED_TOKENS,
  });
}

// Setup's host ID wins so OpenAI sees the same host the CLI registered.
async function upsertConnection(
  data: Omit<Prisma.ChatGptConnectionUncheckedCreateInput, "id" | "hostId">,
) {
  await prisma.chatGptConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      hostId: env.CHATGPT_HOST_ID ?? createChatGptHostId(),
      ...data,
    },
    update: {
      ...(env.CHATGPT_HOST_ID ? { hostId: env.CHATGPT_HOST_ID } : {}),
      ...data,
    },
  });
}
