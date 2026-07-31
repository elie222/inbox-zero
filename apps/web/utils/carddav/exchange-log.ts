import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

// The CardDAV sync debugger's data feed: one row per request served, read
// back by the sync settings panel. Contacts clients fail without error
// messages and platform logs are often unreachable, so the app keeps its
// own short-lived journal of exactly what each client asked and got.

const RETENTION_MS = 48 * 60 * 60 * 1000;

export async function recordCarddavExchange({
  emailAccountId,
  method,
  path,
  depth,
  status,
  responseBytes,
  userAgent,
  detail,
}: {
  emailAccountId: string;
  method: string;
  path: string;
  depth: string | null;
  status: number;
  responseBytes: number;
  userAgent: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  // Never let journaling break the sync it exists to debug
  try {
    await prisma.carddavExchange.create({
      data: {
        emailAccountId,
        method,
        path,
        depth,
        status,
        responseBytes,
        userAgent,
        detail: (detail as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    await prisma.carddavExchange.deleteMany({
      where: {
        emailAccountId,
        createdAt: { lt: new Date(Date.now() - RETENTION_MS) },
      },
    });
  } catch {
    // The exchange itself already succeeded; drop the journal row
  }
}
