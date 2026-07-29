import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import prisma from "@/utils/prisma";

// CardDAV clients authenticate with HTTP Basic: the account email plus a
// generated app password (stored hashed).

export function generateCarddavPassword(): string {
  return randomBytes(18).toString("base64url");
}

export function hashCarddavPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// Distinguishing the failure modes matters operationally: "no-credentials"
// is the normal first leg of the Basic handshake, while "wrong-password"
// after a password reset means a device is still holding the old one. The
// reason is for logs only — the client always gets the same opaque 401.
export type CarddavAuthResult =
  | { ok: true; emailAccountId: string; email: string }
  | {
      ok: false;
      reason:
        | "no-credentials"
        | "malformed-header"
        | "unknown-user"
        | "wrong-password";
    };

export async function authenticateCarddavRequest(
  authorizationHeader: string | null,
): Promise<CarddavAuthResult> {
  if (!authorizationHeader?.startsWith("Basic ")) {
    return { ok: false, reason: "no-credentials" };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(authorizationHeader.slice(6), "base64").toString(
      "utf-8",
    );
  } catch {
    return { ok: false, reason: "malformed-header" };
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return { ok: false, reason: "malformed-header" };
  const email = decoded.slice(0, separator).trim().toLowerCase();
  const password = decoded.slice(separator + 1);
  if (!email || !password) return { ok: false, reason: "malformed-header" };

  const account = await prisma.emailAccount.findFirst({
    where: { email, carddavPasswordHash: { not: null } },
    select: { id: true, email: true, carddavPasswordHash: true },
  });
  if (!account?.carddavPasswordHash) {
    return { ok: false, reason: "unknown-user" };
  }

  const expected = Buffer.from(account.carddavPasswordHash, "hex");
  const actual = createHash("sha256").update(password).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "wrong-password" };
  }

  return { ok: true, emailAccountId: account.id, email: account.email };
}

export function unauthorizedResponse(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zerrow Contacts"' },
  });
}
