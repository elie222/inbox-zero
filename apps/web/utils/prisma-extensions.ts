import { Prisma } from "@/generated/prisma/client";
import { decryptToken, encryptToken } from "@/utils/encryption";

/**
 * Fields that are transparently encrypted at rest. To add a new field:
 *   1. Add it here under the Prisma model name (camelCase).
 *   2. If the field already has plaintext values in the DB, nothing else is
 *      needed: reads pass plaintext through untouched until the row is next
 *      written. Optional: run a backfill to re-save the values so they adopt
 *      the versioned ciphertext format.
 *
 * Do NOT add fields that are queried by value (e.g. Session.sessionToken,
 * EmailToken.token): random-IV encryption breaks WHERE lookups.
 */
const ENCRYPTED_FIELDS = {
  account: ["access_token", "refresh_token"],
  calendarConnection: ["accessToken", "refreshToken"],
  driveConnection: ["accessToken", "refreshToken"],
  messagingChannel: ["accessToken", "refreshToken"],
  mcpConnection: ["accessToken", "refreshToken", "apiKey"],
  mcpIntegration: ["oauthClientSecret"],
  user: ["aiApiKey", "webhookSecret"],
} as const satisfies Record<string, readonly string[]>;

type FieldSpec = Record<string, readonly string[]>;
type MutableData = Record<string, unknown> | undefined | null;

export const encryptedTokens = Prisma.defineExtension((client) =>
  client.$extends({
    result: buildResult(ENCRYPTED_FIELDS) as never,
    query: buildQuery(ENCRYPTED_FIELDS) as never,
  }),
);

function buildResult(spec: FieldSpec) {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [model, fields] of Object.entries(spec)) {
    const modelResult: Record<string, unknown> = {};
    for (const field of fields) {
      modelResult[field] = {
        needs: { [field]: true },
        compute(row: Record<string, string | null>) {
          return decryptToken(row[field]);
        },
      };
    }
    result[model] = modelResult;
  }
  return result;
}

export const __testing__ = {
  buildQuery,
  encryptCreateData,
  encryptUpdateData,
};

function buildQuery(spec: FieldSpec) {
  const query: Record<string, Record<string, unknown>> = {};
  for (const [model, fields] of Object.entries(spec)) {
    query[model] = {
      async create({ args, query }: QueryArgs<"create">) {
        encryptCreateData(args.data, fields);
        return query(args);
      },
      async update({ args, query }: QueryArgs<"update">) {
        encryptUpdateData(args.data, fields);
        return query(args);
      },
      async updateMany({ args, query }: QueryArgs<"updateMany">) {
        encryptUpdateData(args.data, fields);
        return query(args);
      },
      async upsert({ args, query }: QueryArgs<"upsert">) {
        encryptCreateData(args.create, fields);
        encryptUpdateData(args.update, fields);
        return query(args);
      },
    };
  }
  return query;
}

function encryptCreateData(data: MutableData, fields: readonly string[]) {
  if (!data) return;
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string") data[field] = encryptToken(value);
  }
}

function encryptUpdateData(data: MutableData, fields: readonly string[]) {
  if (!data) return;
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string") {
      data[field] = encryptToken(value);
    } else if (isSetWrapper(value) && typeof value.set === "string") {
      value.set = encryptToken(value.set);
    }
  }
}

function isSetWrapper(value: unknown): value is { set: unknown } {
  return typeof value === "object" && value !== null && "set" in value;
}

type QueryArgs<Op extends "create" | "update" | "updateMany" | "upsert"> = {
  args: Op extends "upsert"
    ? { create: MutableData; update: MutableData }
    : { data: MutableData };
  query: (args: unknown) => Promise<unknown>;
};
