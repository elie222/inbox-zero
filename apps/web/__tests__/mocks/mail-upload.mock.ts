import { vi } from "vitest";
import { collectBlobBytes } from "@inboxzero/mail-core/ports/blob-store";
import {
  getMailUploadStore,
  type MailUploadStore,
} from "@/utils/mail-api/upload-storage";
import type { MailUpload } from "@/generated/prisma/client";
import type prismaMock from "@/utils/__mocks__/prisma";

vi.mock("@/utils/mail-api/upload-storage", () => ({
  getMailUploadStore: vi.fn(),
}));

type Where = Record<string, unknown>;
type Page = {
  where: Where;
  take?: number;
  orderBy?: Record<string, "asc" | "desc">;
};

/**
 * Backs `prisma.mailUpload` with an in-memory table so upload staging can be
 * tested as the state machine it is, rather than as a list of Prisma calls.
 */
export function installMailUploadTable(prisma: typeof prismaMock) {
  const rows = new Map<string, MailUpload>();
  let nextId = 0;
  const ledger = new Map<string, { storageKey: string; createdAt: Date }>();
  const objects = new Map<string, Uint8Array>();
  const store: MailUploadStore = {
    async put(key, bytes, sizeBytes) {
      const collected = await collectBlobBytes(bytes, sizeBytes);
      if (collected.status !== "ok") throw new Error("Too large");
      objects.set(key, collected.bytes);
    },
    async read(key) {
      const content = objects.get(key);
      return content
        ? (async function* () {
            yield content;
          })()
        : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  vi.mocked(getMailUploadStore).mockReturnValue(store);

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
      id: `upload-${++nextId}`,
      createdAt: new Date(),
      // Nullable columns Postgres defaults for us.
      stagedAt: null,
      deletionRequestedAt: null,
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

  prisma.mailUpload.findMany.mockImplementation((async (args: Page) =>
    paginate(select(rows, args.where), args)) as never);

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
  prisma.mailUploadObject.create.mockImplementation((async ({
    data,
  }: {
    data: { storageKey: string };
  }) => {
    const object = { ...data, createdAt: new Date() };
    ledger.set(data.storageKey, object);
    return object;
  }) as never);
  const selectObjects = (where: Where) => {
    const { mailUpload, ...filters } = where;
    return [...ledger.values()].filter(
      (object) =>
        matches(object, filters) &&
        (mailUpload !== null ||
          ![...rows.values()].some(
            (row) => row.storageKey === object.storageKey,
          )),
    );
  };
  prisma.mailUploadObject.findMany.mockImplementation((async (args: Page) =>
    paginate(selectObjects(args.where), args)) as never);
  prisma.mailUploadObject.deleteMany.mockImplementation((async ({
    where,
  }: {
    where: Where;
  }) => {
    const objects = selectObjects(where);
    for (const object of objects) ledger.delete(object.storageKey);
    return { count: objects.length };
  }) as never);
  return store;
}

function rowKey(emailAccountId: string, blobId: string) {
  return JSON.stringify([emailAccountId, blobId]);
}

function paginate<T extends object>(found: T[], { take, orderBy }: Page) {
  const [field] = Object.keys(orderBy ?? {}) as (keyof T)[];
  const sorted = field
    ? [...found].sort((a, b) => (a[field] < b[field] ? -1 : 1))
    : found;
  return take === undefined ? sorted : sorted.slice(0, take);
}

function select(rows: Map<string, MailUpload>, where: Where) {
  return [...rows.values()].filter((row) => matches(row, where));
}

function matches(
  row: MailUpload | { storageKey: string; createdAt: Date },
  where: Where,
): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") {
      return (condition as Where[]).some((clause) => matches(row, clause));
    }
    const value = row[field as keyof typeof row];
    if (condition === null) return value === null;
    if (condition && typeof condition === "object") {
      const filter = condition as {
        in?: unknown[];
        lt?: Date;
        gt?: string;
        not?: unknown;
        startsWith?: string;
      };
      if (
        filter.startsWith &&
        (typeof value !== "string" || !value.startsWith(filter.startsWith))
      )
        return false;
      if (filter.in && !filter.in.includes(value)) return false;
      if (filter.lt && !(value instanceof Date && value < filter.lt)) {
        return false;
      }
      if (filter.gt && !(typeof value === "string" && value > filter.gt))
        return false;
      if ("not" in filter && value === filter.not) return false;
      return true;
    }
    return value === condition;
  });
}
