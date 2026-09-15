// Re-keys Microsoft accounts from the legacy pairwise OIDC subject to the Entra
// object id that sign-in now looks accounts up by. Sign-in re-keys an account
// on its own next attempt; this sweeps the accounts that do not sign in again.
//
// Run with: `pnpm --filter inbox-zero-ai exec tsx scripts/migrate-microsoft-provider-account-ids.ts`
// Apply changes with: `pnpm --filter inbox-zero-ai exec tsx scripts/migrate-microsoft-provider-account-ids.ts --apply`

import "dotenv/config";
import { env } from "@/env";
import { decryptToken } from "@/utils/encryption";
import {
  decodeMicrosoftIdTokenClaims,
  requestMicrosoftToken,
} from "@/utils/microsoft/oauth";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import prisma from "@/utils/prisma";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MicrosoftTokenResponse = {
  access_token?: string;
  id_token?: string;
  error_description?: string;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const microsoftCredentials = options.idTokenOnly
    ? null
    : requireMicrosoftCredentials();

  const microsoftAccounts = await prisma.account.findMany({
    where: { provider: "microsoft" },
    select: {
      id: true,
      providerAccountId: true,
      id_token: true,
      refresh_token: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Object ids are UUIDs; anything else is still keyed on the OIDC subject.
  const candidates = microsoftAccounts
    .filter((account) => !UUID_REGEX.test(account.providerAccountId))
    .slice(0, options.limit);

  const stats = {
    candidates: candidates.length,
    wouldUpdate: 0,
    updated: 0,
    skippedNoRefreshToken: 0,
    skippedTokenError: 0,
    skippedConflict: 0,
    skippedSameSubject: 0,
    resolvedFromIdToken: 0,
    resolvedFromRefresh: 0,
    skippedNoIdToken: 0,
  };

  for (const account of candidates) {
    // The id_token stored at sign-in already carries the object id. Reading it
    // costs no Microsoft call and works for accounts whose refresh token is
    // gone, which are the ones that cannot re-key themselves by signing in.
    const storedObjectId = decodeMicrosoftIdTokenClaims(account.id_token).oid;
    if (storedObjectId) stats.resolvedFromIdToken += 1;

    const subject =
      storedObjectId ??
      (microsoftCredentials
        ? await resolveViaRefresh(account, stats, microsoftCredentials)
        : null);

    if (!subject && !microsoftCredentials) stats.skippedNoIdToken += 1;

    if (!subject) continue;

    if (subject === account.providerAccountId) {
      stats.skippedSameSubject += 1;
      continue;
    }

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "microsoft",
          providerAccountId: subject,
        },
      },
      select: { id: true },
    });

    if (existingAccount && existingAccount.id !== account.id) {
      stats.skippedConflict += 1;
      console.warn("Skipped Microsoft account with existing subject account", {
        accountId: account.id,
        existingAccountId: existingAccount.id,
      });
      continue;
    }

    if (options.apply) {
      await prisma.account.update({
        where: { id: account.id },
        data: { providerAccountId: subject },
      });
      stats.updated += 1;
    } else {
      stats.wouldUpdate += 1;
    }
  }

  console.log(JSON.stringify({ apply: options.apply, ...stats }, null, 2));
}

function requireMicrosoftCredentials() {
  // The refresh fallback cannot work without these, and a per-account catch
  // would otherwise turn that into 900 skipped accounts and a clean exit.
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error(
      "Microsoft OAuth credentials are required unless --id-token-only is set",
    );
  }

  return {
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
  };
}

async function resolveViaRefresh(
  account: { id: string; refresh_token: string | null },
  stats: {
    skippedNoRefreshToken: number;
    skippedTokenError: number;
    resolvedFromRefresh: number;
  },
  credentials: { clientId: string; clientSecret: string },
) {
  const refreshToken = getRefreshToken(account.refresh_token);

  if (!refreshToken) {
    stats.skippedNoRefreshToken += 1;
    return null;
  }

  const objectId = await getMicrosoftObjectId(refreshToken, credentials).catch(
    (error) => {
      stats.skippedTokenError += 1;
      console.warn("Failed to resolve Microsoft object id for account", {
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    },
  );

  if (objectId) stats.resolvedFromRefresh += 1;
  return objectId;
}

function parseOptions(args: string[]) {
  let apply = false;
  let idTokenOnly = false;
  let limit = Number.POSITIVE_INFINITY;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    // Resolve only from stored id_tokens, so the run makes no provider calls.
    if (arg === "--id-token-only") {
      idTokenOnly = true;
      continue;
    }

    if (arg === "--limit") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --limit");
      limit = Number.parseInt(value, 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply, idTokenOnly, limit };
}

async function getMicrosoftObjectId(
  refreshToken: string,
  credentials: { clientId: string; clientSecret: string },
) {
  const tokenResponse = await requestMicrosoftToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: OUTLOOK_SCOPES.join(" "),
  });

  const tokens = (await tokenResponse.json()) as MicrosoftTokenResponse;

  if (!tokenResponse.ok || !tokens.access_token) {
    throw new Error(tokens.error_description || "Failed to refresh token");
  }

  const { oid } = decodeMicrosoftIdTokenClaims(tokens.id_token);
  if (!oid) throw new Error("Refreshed id_token has no oid claim");

  return oid;
}

function getRefreshToken(value: string | null) {
  if (!value) return null;

  if (value.startsWith("v") || /^[0-9a-f]+$/i.test(value)) {
    return decryptToken(value);
  }

  return value;
}

function printHelpAndExit(): never {
  process.stdout.write(
    "Usage: tsx scripts/migrate-microsoft-provider-account-ids.ts [--apply] [--id-token-only] [--limit N]\n",
  );
  process.exit(0);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
