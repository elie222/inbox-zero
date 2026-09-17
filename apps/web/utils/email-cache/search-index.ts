import type { BindingSpec, Database } from "@sqlite.org/sqlite-wasm";
import {
  getNormalizedSearchText,
  parseLocalSearch,
  type SearchMessage,
} from "./search-query";

export type SearchIndexBatch = {
  emailAccountId: string;
  generation: string;
  expectedRevision: number;
  revision: number;
  upserts: SearchMessage[];
  deletes: string[];
  replacement?: {
    threadId: string;
    token: string;
    phase: "start" | "continue" | "finish";
  };
};

export type SearchIndexQuery = {
  emailAccountId: string;
  generation: string;
  query: string;
  labels: { id: string; name: string }[];
  limit?: number;
  beforeRowId?: string;
};

export type SearchIndexPage = {
  status: "ready" | "unsupported" | "unavailable";
  revision: number;
  messages: { id: string; threadId: string; rowId: string }[];
  nextCursor?: string;
  pendingReplacements?: boolean;
};

type AccountState = { generation: string; revision: number };
type StoredDocument = { row_id: bigint; received: number | null };
type SearchField = "all_text" | "from_text" | "to_text" | "subject_text";
type ParsedQuery = NonNullable<ReturnType<typeof parseLocalSearch>>;
const ROW_ID_SCALE = BigInt("1048576");
const MAX_ROW_ID = (BigInt("1") << BigInt("63")) - BigInt("1");
const MIN_ROW_ID = -(BigInt("1") << BigInt("63"));
const MAX_BATCH_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_MESSAGE_CHARACTERS = 2_000_000;
const SCHEMA_VERSION = 1;

export class SearchIndexCapacityError extends Error {
  readonly code:
    | "document-too-large"
    | "timestamp-out-of-range"
    | "timestamp-slots-exhausted"
    | "storage-full";
  constructor(code: SearchIndexCapacityError["code"]) {
    super(code);
    this.code = code;
    this.name = "SearchIndexCapacityError";
  }
}

/** The caller owns the connection and must serialize access across windows. */
export function createSearchIndex(database: Database) {
  database.exec(
    "PRAGMA cache_size=-8192; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;",
  );
  const version = Number(database.selectValue("PRAGMA user_version"));
  if (version !== 0 && version !== SCHEMA_VERSION) {
    throw new Error("Unsupported local search index version");
  }
  if (
    version === 0 &&
    !Number(database.selectValue("SELECT count(*) FROM sqlite_schema"))
  )
    database.exec("PRAGMA auto_vacuum=INCREMENTAL");
  indexTransaction(database, () => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS search_accounts (
        account TEXT PRIMARY KEY, generation TEXT NOT NULL, revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS search_documents (
        row_id INTEGER PRIMARY KEY, account TEXT NOT NULL, message_id TEXT NOT NULL,
        thread_id TEXT NOT NULL, received INTEGER,
        all_text TEXT NOT NULL, from_text TEXT NOT NULL, to_text TEXT NOT NULL,
        subject_text TEXT NOT NULL, labels TEXT NOT NULL, visible INTEGER NOT NULL,
        replacement_token TEXT,
        UNIQUE(account, message_id)
      );
      CREATE INDEX IF NOT EXISTS search_account_order ON search_documents(account, row_id DESC);
      CREATE INDEX IF NOT EXISTS search_account_thread ON search_documents(account, thread_id);
      CREATE TABLE IF NOT EXISTS search_replacements (
        account TEXT NOT NULL, thread_id TEXT NOT NULL, token TEXT NOT NULL,
        PRIMARY KEY(account, thread_id)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS search_long USING fts5(
        all_text, from_text, to_text, subject_text, filter_tokens,
        content='', contentless_delete=1, tokenize='trigram case_sensitive 1'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS search_short USING fts5(
        all_text, from_text, to_text, subject_text, filter_tokens,
        content='', contentless_delete=1, detail=column, tokenize='ascii'
      );
      PRAGMA user_version=${SCHEMA_VERSION};
      INSERT INTO search_long(search_long,rank) VALUES('secure-delete',1);
      INSERT INTO search_short(search_short,rank) VALUES('secure-delete',1);
    `);
  });

  function getAccount(emailAccountId: string) {
    return database.selectObject(
      "SELECT generation, revision FROM search_accounts WHERE account=?",
      [emailAccountId],
    ) as AccountState | undefined;
  }

  function removeDocument(rowId: bigint) {
    database.exec({
      sql: "DELETE FROM search_long WHERE rowid=?",
      bind: [rowId],
    });
    database.exec({
      sql: "DELETE FROM search_short WHERE rowid=?",
      bind: [rowId],
    });
    database.exec({
      sql: "DELETE FROM search_documents WHERE row_id=?",
      bind: [rowId],
    });
  }

  function removeAccountContent(emailAccountId: string) {
    // Clearing a large account never materializes all its message identities.
    while (true) {
      const rows = database.exec({
        sql: "SELECT row_id FROM search_documents WHERE account=? LIMIT 100",
        bind: [emailAccountId],
        rowMode: "array",
        returnValue: "resultRows",
      }) as unknown[][];
      if (!rows.length) break;
      const rowIds = rows.map(([id]) => readRowId(id));
      const placeholders = rowIds.map(() => "?").join(",");
      for (const table of ["search_long", "search_short", "search_documents"]) {
        database.exec({
          sql: `DELETE FROM ${table} WHERE rowid IN (${placeholders})`,
          bind: rowIds,
        });
      }
    }
    database.exec({
      sql: "DELETE FROM search_replacements WHERE account=?",
      bind: [emailAccountId],
    });
  }

  return {
    reclaimStorage() {
      const pageSize = Number(database.selectValue("PRAGMA page_size"));
      const beforeBytes =
        Number(database.selectValue("PRAGMA page_count")) * pageSize;
      const incrementalVacuum =
        Number(database.selectValue("PRAGMA auto_vacuum")) === 2;
      // Never rebuild an existing layout at quota: full VACUUM needs temporary space.
      if (incrementalVacuum) {
        const beforePages = beforeBytes / pageSize;
        // Each statement can also remove a pointer-map page. Leave room for it.
        for (let step = 0; step < 256; step++) {
          const remaining = Number(
            database.selectValue("PRAGMA freelist_count"),
          );
          const removed =
            beforePages - Number(database.selectValue("PRAGMA page_count"));
          if (!remaining || removed >= 254) break;
          // One-page statements avoid depending on how exec steps vacuum result rows.
          database.exec("PRAGMA incremental_vacuum(1)");
        }
      }
      return {
        incrementalVacuum,
        beforeBytes,
        afterBytes:
          Number(database.selectValue("PRAGMA page_count")) * pageSize,
        reusableBytes:
          Number(database.selectValue("PRAGMA freelist_count")) * pageSize,
      };
    },
    setStorageLimit(bytes: number) {
      return setSearchIndexStorageLimit(database, bytes);
    },

    getAccountState(emailAccountId: string) {
      return getAccount(emailAccountId) ?? null;
    },

    listAccounts(after?: string) {
      const rows = database.exec({
        sql: "SELECT account AS emailAccountId,generation,revision FROM search_accounts WHERE account>? ORDER BY account LIMIT 101",
        bind: [after ?? ""],
        rowMode: "object",
        returnValue: "resultRows",
      }) as (AccountState & { emailAccountId: string })[];
      return {
        accounts: rows.slice(0, 100),
        ...(rows.length > 100 ? { nextCursor: rows[99].emailAccountId } : {}),
      };
    },

    getThreadReplacementState(emailAccountId: string, threadId: string) {
      const token = database.selectValue(
        "SELECT token FROM search_replacements WHERE account=? AND thread_id=?",
        [emailAccountId, threadId],
      );
      return typeof token === "string" ? { token } : null;
    },

    deleteAccount({
      emailAccountId,
      generation,
    }: {
      emailAccountId: string;
      generation: string;
    }) {
      return indexTransaction(database, () => {
        const state = getAccount(emailAccountId);
        if (!state) return true;
        if (state.generation !== generation) return false;
        removeAccountContent(emailAccountId);
        database.exec({
          sql: "DELETE FROM search_accounts WHERE account=?",
          bind: [emailAccountId],
        });
        return true;
      });
    },
    /** A generation fences responses from a removed or reinitialized account. */
    resetAccount({
      emailAccountId,
      generation,
      expectedGeneration,
    }: {
      emailAccountId: string;
      generation: string;
      expectedGeneration: string | null;
    }) {
      if (!emailAccountId || !generation)
        throw new Error("Missing index account identity");
      return indexTransaction(database, () => {
        const previous = getAccount(emailAccountId);
        if (previous?.generation === generation) return true;
        if ((previous?.generation ?? null) !== expectedGeneration) return false;
        removeAccountContent(emailAccountId);
        database.exec({
          sql: "INSERT INTO search_accounts VALUES(?,?,0) ON CONFLICT(account) DO UPDATE SET generation=excluded.generation,revision=0",
          bind: [emailAccountId, generation],
        });
        return true;
      });
    },

    applyBatch(batch: SearchIndexBatch) {
      validateRevision(batch.expectedRevision);
      validateRevision(batch.revision);
      if (
        batch.revision <= batch.expectedRevision ||
        batch.upserts.length + batch.deletes.length > MAX_BATCH_SIZE
      ) {
        throw new Error("Invalid search index batch");
      }
      return indexTransaction(database, () => {
        const state = getAccount(batch.emailAccountId);
        if (!state || state.generation !== batch.generation) return false;
        // A revision identifies progress, not a payload. Another producer may
        // have committed different work at this revision; never acknowledge it.
        if (state.revision !== batch.expectedRevision) return false;
        const replacement = batch.replacement;
        if (
          database.selectValue(
            "SELECT 1 FROM search_replacements WHERE account=? LIMIT 1",
            [batch.emailAccountId],
          ) === 1
        ) {
          const touchedThreads = new Set(
            batch.upserts.map((message) => message.threadId),
          );
          for (const id of [
            ...batch.deletes,
            ...batch.upserts.map((message) => message.id),
          ]) {
            const thread = database.selectValue(
              "SELECT thread_id FROM search_documents WHERE account=? AND message_id=?",
              [batch.emailAccountId, id],
            );
            if (typeof thread === "string") touchedThreads.add(thread);
          }
          for (const threadId of touchedThreads) {
            const active = database.selectValue(
              "SELECT token FROM search_replacements WHERE account=? AND thread_id=?",
              [batch.emailAccountId, threadId],
            );
            if (
              active !== undefined &&
              (replacement?.threadId !== threadId ||
                (replacement.phase !== "start" && replacement.token !== active))
            )
              return false;
          }
        }
        if (replacement) {
          if (
            !replacement.threadId ||
            !replacement.token ||
            batch.upserts.some(
              (message) => message.threadId !== replacement.threadId,
            )
          )
            throw new Error("Invalid thread replacement page");
          const active = database.selectValue(
            "SELECT token FROM search_replacements WHERE account=? AND thread_id=?",
            [batch.emailAccountId, replacement.threadId],
          );
          if (replacement.phase !== "start" && active !== replacement.token)
            return false;
          if (replacement.phase === "start")
            database.exec({
              sql: "INSERT INTO search_replacements VALUES(?,?,?) ON CONFLICT(account,thread_id) DO UPDATE SET token=excluded.token",
              bind: [
                batch.emailAccountId,
                replacement.threadId,
                replacement.token,
              ],
            });
        }
        for (const messageId of batch.deletes) {
          const row = database.selectValue(
            "SELECT row_id FROM search_documents WHERE account=? AND message_id=?",
            [batch.emailAccountId, messageId],
          );
          if (row !== undefined) removeDocument(readRowId(row));
        }
        for (const message of batch.upserts) {
          const fields = getSearchFields(message);
          if (
            Object.values(fields).reduce((sum, text) => sum + text.length, 0) >
            MAX_MESSAGE_CHARACTERS
          ) {
            throw new SearchIndexCapacityError("document-too-large");
          }
          const received = getReceivedAt(message);
          const existing = database.selectObject(
            "SELECT row_id, received FROM search_documents WHERE account=? AND message_id=?",
            [batch.emailAccountId, message.id],
          ) as StoredDocument | undefined;
          let rowId: bigint;
          if (existing && existing.received === received)
            rowId = BigInt(existing.row_id);
          else {
            // Invalid provider dates retain the existing matcher's undated behavior.
            const base = getRowIdBase(received ?? 0);
            const last = database.selectValue(
              "SELECT MAX(row_id) FROM search_documents WHERE row_id>=? AND row_id<=?",
              [base, base + ROW_ID_SCALE - BigInt("1")],
            );
            rowId =
              last === null || last === undefined
                ? base
                : readRowId(last) + BigInt("1");
            if (rowId >= base + ROW_ID_SCALE)
              throw new SearchIndexCapacityError("timestamp-slots-exhausted");
          }
          if (existing) removeDocument(BigInt(existing.row_id));
          const labels = message.labelIds ?? [];
          const visible = !labels.some(
            (label) => label === "SPAM" || label === "TRASH",
          );
          const filters = [
            encodeIdentity("a", batch.emailAccountId),
            ...labels.map((label) => encodeIdentity("l", label)),
            ...(visible ? ["visible"] : []),
          ].join(" ");
          const longFilters = [
            encodeLongIdentity("a", batch.emailAccountId),
            ...labels.map((label) => encodeLongIdentity("l", label)),
            ...(visible ? ["vis"] : []),
          ].join(" ");
          const texts = [
            fields.all_text,
            fields.from_text,
            fields.to_text,
            fields.subject_text,
          ];
          database.exec({
            sql: "INSERT INTO search_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            bind: [
              rowId,
              batch.emailAccountId,
              message.id,
              message.threadId,
              received,
              ...texts,
              JSON.stringify(labels),
              Number(visible),
              replacement?.token ?? null,
            ],
          });
          database.exec({
            sql: "INSERT INTO search_long(rowid,all_text,from_text,to_text,subject_text,filter_tokens) VALUES(?,?,?,?,?,?)",
            // SQLite tokenization stops at NUL; candidate expansion
            // plus exact verification preserves matching on either side of it.
            bind: [
              rowId,
              ...texts.map((text) => text.replaceAll("\0", "\uFFFD")),
              longFilters,
            ],
          });
          database.exec({
            sql: "INSERT INTO search_short(rowid,all_text,from_text,to_text,subject_text,filter_tokens) VALUES(?,?,?,?,?,?)",
            bind: [rowId, ...texts.map(encodeShortTerms), filters],
          });
        }
        if (replacement?.phase === "finish") {
          const sql =
            "SELECT row_id FROM search_documents WHERE account=? AND thread_id=? AND replacement_token IS NOT ? LIMIT 1";
          const bind = [
            batch.emailAccountId,
            replacement.threadId,
            replacement.token,
          ];
          let row = database.selectValue(sql, bind);
          while (row !== undefined) {
            removeDocument(readRowId(row));
            row = database.selectValue(sql, bind);
          }
          database.exec({
            sql: "DELETE FROM search_replacements WHERE account=? AND thread_id=? AND token=?",
            bind,
          });
        }
        database.exec({
          sql: "UPDATE search_accounts SET revision=? WHERE account=?",
          bind: [batch.revision, batch.emailAccountId],
        });
        return true;
      });
    },

    search(request: SearchIndexQuery): SearchIndexPage {
      const state = getAccount(request.emailAccountId);
      if (!state || state.generation !== request.generation)
        return { status: "unavailable", revision: 0, messages: [] };
      const parsed = parseLocalSearch(request.query, request.labels);
      if (!parsed)
        return {
          status: "unsupported",
          revision: state.revision,
          messages: [],
        };
      const limit = request.limit ?? 50;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE)
        throw new Error("Invalid search page size");
      const compiled = compileQuery(request, parsed, limit + 1);
      const rows = database.exec({
        ...compiled,
        rowMode: "object",
        returnValue: "resultRows",
      }) as { id: string; threadId: string; rowId: string }[];
      const messages = rows.slice(0, limit);
      return {
        status: "ready",
        revision: state.revision,
        messages,
        pendingReplacements:
          database.selectValue(
            "SELECT 1 FROM search_replacements WHERE account=? LIMIT 1",
            [request.emailAccountId],
          ) === 1,
        ...(rows.length > limit ? { nextCursor: messages.at(-1)!.rowId } : {}),
      };
    },

    getStorageBytes() {
      return getSearchIndexStorageBytes(database);
    },
  };
}

export function getSearchIndexStorageBytes(database: Database) {
  return (
    Number(database.selectValue("PRAGMA page_count")) *
    Number(database.selectValue("PRAGMA page_size"))
  );
}

export function setSearchIndexStorageLimit(database: Database, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error("Invalid search index storage limit");
  const pageSize = Number(database.selectValue("PRAGMA page_size"));
  if (bytes < pageSize && getSearchIndexStorageBytes(database) === 0)
    throw new SearchIndexCapacityError("storage-full");
  const pages = Math.max(1, Math.floor(bytes / pageSize));
  // Apply before schema creation as well as later FTS allocations.
  return (
    Number(database.selectValue(`PRAGMA max_page_count=${pages}`)) * pageSize
  );
}

function compileQuery(
  request: SearchIndexQuery,
  parsed: ParsedQuery,
  limit: number,
) {
  const filters = [
    `filter_tokens:${quoteMatch(encodeIdentity("a", request.emailAccountId))}`,
  ];
  const longFilters = [
    `filter_tokens:${quoteMatch(encodeLongIdentity("a", request.emailAccountId))}`,
  ];
  if (!parsed.includeSpamTrash) filters.push('filter_tokens:"visible"');
  if (!parsed.includeSpamTrash) longFilters.push('filter_tokens:"vis"');
  const long: string[] = [];
  const short: string[] = [];
  const checks = ["d.account=?"];
  const values: (string | number | bigint)[] = [request.emailAccountId];
  if (!parsed.includeSpamTrash) checks.push("d.visible=1");
  for (const term of parsed.terms) {
    if (term.field === "after" || term.field === "before") {
      checks.push(`d.received${term.field === "after" ? ">" : "<"}?`);
      values.push(term.value);
      const bound =
        BigInt(term.value + (term.field === "after" ? 1 : 0)) * ROW_ID_SCALE;
      if (
        (term.field === "after" && bound > MAX_ROW_ID) ||
        (term.field === "before" && bound <= MIN_ROW_ID)
      )
        checks.push("0");
      else if (bound >= MIN_ROW_ID && bound <= MAX_ROW_ID) {
        checks.push(`p.rowid${term.field === "after" ? ">=" : "<"}?`);
        values.push(bound);
      }
    } else if (term.field === "label") {
      filters.push(
        `filter_tokens:${quoteMatch(encodeIdentity("l", term.value))}`,
      );
      longFilters.push(
        `filter_tokens:${quoteMatch(encodeLongIdentity("l", term.value))}`,
      );
      checks.push("EXISTS (SELECT 1 FROM json_each(d.labels) WHERE value=?)");
      values.push(term.value);
    } else {
      const field: SearchField =
        term.field === "text"
          ? "all_text"
          : term.field === "from"
            ? "from_text"
            : term.field === "to"
              ? "to_text"
              : "subject_text";
      if (Array.from(term.value).length < 3)
        short.push(`${field}:${quoteMatch(encodeShortQuery(term.value))}`);
      else
        long.push(
          `${field}:${quoteMatch(term.value.replaceAll("\0", "\uFFFD"))}`,
        );
      checks.push(`instr(d.${field},?)>0`);
      values.push(term.value);
    }
  }
  if (request.beforeRowId !== undefined) {
    if (!/^-?\d+$/u.test(request.beforeRowId))
      throw new Error("Invalid search cursor");
    const cursor = BigInt(request.beforeRowId);
    if (cursor < MIN_ROW_ID || cursor > MAX_ROW_ID)
      throw new Error("Invalid search cursor");
    checks.push("p.rowid<?");
    values.push(cursor);
  }
  // Even filter-only queries traverse ordered postings, avoiding a scan of all
  // text matches when a label or account is sparse.
  const primary = long.length ? "search_long" : "search_short";
  const secondary = long.length && short.length ? "search_short" : undefined;
  const match = [
    ...(long.length ? longFilters : filters),
    ...(long.length ? long : short),
  ].join(" AND ");
  const bind: BindingSpec = [
    match,
    ...(secondary ? [[...filters, ...short].join(" AND ")] : []),
    ...values,
    limit,
  ];
  return {
    sql: `SELECT d.message_id AS id,d.thread_id AS threadId,CAST(p.rowid AS TEXT) AS rowId
      FROM ${primary} p
      CROSS JOIN search_documents d ON d.row_id=p.rowid
      ${secondary ? `CROSS JOIN ${secondary} s ON s.rowid=p.rowid` : ""}
      WHERE ${primary} MATCH ? ${secondary ? `AND ${secondary} MATCH ?` : ""}
        AND ${checks.join(" AND ")}
      ORDER BY p.rowid DESC LIMIT ?`,
    bind,
  };
}

function getSearchFields(message: SearchMessage) {
  return {
    all_text: getNormalizedSearchText(message, "text"),
    from_text: getNormalizedSearchText(message, "from"),
    to_text: getNormalizedSearchText(message, "to"),
    subject_text: getNormalizedSearchText(message, "subject"),
  };
}

function getReceivedAt(message: SearchMessage) {
  const received =
    message.internalDate && /^\d+$/u.test(message.internalDate)
      ? Number(message.internalDate)
      : Date.parse(message.internalDate || message.date || "");
  return Number.isFinite(received) ? received : null;
}

function getRowIdBase(received: number) {
  if (!Number.isSafeInteger(received))
    throw new SearchIndexCapacityError("timestamp-out-of-range");
  const base = BigInt(received) * ROW_ID_SCALE;
  if (base < MIN_ROW_ID || base + ROW_ID_SCALE - BigInt("1") > MAX_ROW_ID)
    throw new SearchIndexCapacityError("timestamp-out-of-range");
  return base;
}

function encodeShortTerms(text: string) {
  const terms = new Set<string>();
  let previous: string | undefined;
  for (const character of text) {
    const point = character.codePointAt(0)!.toString(16);
    terms.add(`u${point}`);
    if (previous !== undefined) terms.add(`b${previous}x${point}`);
    previous = point;
  }
  return [...terms].join(" ");
}

function encodeShortQuery(text: string) {
  const points = Array.from(text, (character) =>
    character.codePointAt(0)!.toString(16),
  );
  return points.length === 1 ? `u${points[0]}` : `b${points[0]}x${points[1]}`;
}

function encodeIdentity(prefix: string, value: string) {
  return `${prefix}${Array.from(value, (character) => character.codePointAt(0)!.toString(16).padStart(6, "0")).join("")}z`;
}

function encodeLongIdentity(prefix: string, value: string) {
  // A fixed three-codepoint marker is one posting, rather than a costly FTS
  // phrase. Hash collisions only add candidates: account/labels are checked
  // against their exact stored values before returning any result.
  let hash = BigInt("0xcbf29ce484222325");
  for (const character of value)
    hash =
      ((hash ^ BigInt(character.codePointAt(0)!)) * BigInt("0x100000001b3")) &
      BigInt("0xffffffffff");
  return (
    prefix +
    String.fromCodePoint(
      0x1_00_00 + Number(hash & BigInt("0xfffff")),
      0x1_00_00 + Number(hash >> BigInt("20")),
    )
  );
}

function quoteMatch(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function validateRevision(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Invalid search index revision");
}

function readRowId(value: unknown) {
  if (typeof value !== "bigint" && typeof value !== "number")
    throw new Error("Invalid stored search identity");
  return BigInt(value);
}

function indexTransaction<T>(database: Database, write: () => T): T {
  database.exec("BEGIN");
  try {
    const result = write();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // SQLITE_FULL can already roll back the transaction. Preserve its code
      // instead of masking it with the wrapper's second rollback failure.
    }
    throw error;
  }
}
