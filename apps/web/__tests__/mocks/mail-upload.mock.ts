import type { MailUpload } from "@/generated/prisma/client";
import type prismaMock from "@/utils/__mocks__/prisma";

type Where = Record<string, unknown>;

/**
 * Backs `prisma.mailUpload` with an in-memory table so upload staging can be
 * tested as the state machine it is, rather than as a list of Prisma calls.
 */
export function installMailUploadTable(prisma: typeof prismaMock) {
  const rows = new Map<string, MailUpload>();

  prisma.mailUpload.upsert.mockImplementation((async (args: {
    where: {
      emailAccountId_blobId: { emailAccountId: string; blobId: string };
    };
    create: Partial<MailUpload>;
    update: Partial<MailUpload>;
  }) => {
    const { emailAccountId, blobId } = args.where.emailAccountId_blobId;
    const existing = rows.get(rowKey(emailAccountId, blobId));
    const row = {
      id: `upload-${rows.size + 1}`,
      createdAt: new Date(),
      // Nullable columns Postgres defaults for us.
      content: null,
      heldAt: null,
      ...(existing ?? { emailAccountId, blobId, ...args.create }),
      ...(existing ? args.update : {}),
      updatedAt: new Date(),
    } as MailUpload;
    rows.set(rowKey(emailAccountId, blobId), row);
    return row;
  }) as never);

  prisma.mailUpload.findUnique.mockImplementation((async (args: {
    where: {
      emailAccountId_blobId: { emailAccountId: string; blobId: string };
    };
  }) => {
    const { emailAccountId, blobId } = args.where.emailAccountId_blobId;
    return rows.get(rowKey(emailAccountId, blobId)) ?? null;
  }) as never);

  prisma.mailUpload.findFirst.mockImplementation(
    (async (args: { where: Where }) =>
      select(rows, args.where)[0] ?? null) as never,
  );

  prisma.mailUpload.findMany.mockImplementation((async (args: {
    where: Where;
  }) => select(rows, args.where)) as never);

  prisma.mailUpload.updateMany.mockImplementation((async (args: {
    where: Where;
    data: Partial<MailUpload>;
  }) => {
    const matched = select(rows, args.where);
    for (const row of matched) {
      rows.set(rowKey(row.emailAccountId, row.blobId), {
        ...row,
        ...args.data,
        updatedAt: new Date(),
      });
    }
    return { count: matched.length };
  }) as never);

  prisma.mailUpload.deleteMany.mockImplementation((async (args?: {
    where?: Where;
  }) => {
    const matched = select(rows, args?.where ?? {});
    for (const row of matched) {
      rows.delete(rowKey(row.emailAccountId, row.blobId));
    }
    return { count: matched.length };
  }) as never);
}

function rowKey(emailAccountId: string, blobId: string) {
  return JSON.stringify([emailAccountId, blobId]);
}

function select(rows: Map<string, MailUpload>, where: Where) {
  return [...rows.values()].filter((row) => matches(row, where));
}

function matches(row: MailUpload, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") {
      return (condition as Where[]).some((clause) => matches(row, clause));
    }
    const value = row[field as keyof MailUpload];
    if (condition === null) return value === null;
    if (condition && typeof condition === "object") {
      const filter = condition as { in?: unknown[]; lt?: Date; not?: unknown };
      if (filter.in && !filter.in.includes(value)) return false;
      if (filter.lt && !(value instanceof Date && value < filter.lt)) {
        return false;
      }
      if ("not" in filter && value === filter.not) return false;
      return true;
    }
    return value === condition;
  });
}
