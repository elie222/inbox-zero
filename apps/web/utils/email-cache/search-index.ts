import type { BindingSpec, Database } from "@sqlite.org/sqlite-wasm";
import {
  ARCHIVE_SEARCH_LABEL,
  getNormalizedSearchText,
  hasLocalMailAttachment,
  LIVE_MAILBOX_LABELS,
  parseLocalSearch,
  type SearchMessage,
  type SearchNode,
} from "./search-query";
import { SEARCH_INDEX_VERSION } from "./search-index-version";

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
// Fixed markers rather than encoded identities, like the visibility tokens;
// the trigram table needs exactly three characters to index one token.
const ATTACHMENT_TOKEN = "attachment";
const LONG_ATTACHMENT_TOKEN = "att";
const ROW_ID_SCALE = BigInt("1048576");
const MAX_ROW_ID = (BigInt("1") << BigInt("63")) - BigInt("1");
const MIN_ROW_ID = -(BigInt("1") << BigInt("63"));
const MAX_BATCH_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_MESSAGE_CHARACTERS = 2_000_000;

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
  let version = Number(database.selectValue("PRAGMA user_version"));
  if (version !== 0 && version !== SEARCH_INDEX_VERSION) {
    // Another build wrote this layout. Its accounts carry the same version, so
    // they re-queue their mail and refill what this discards.
    discardIndexSchema(database);
    version = 0;
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
        has_attachment INTEGER NOT NULL,
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
      PRAGMA user_version=${SEARCH_INDEX_VERSION};
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
          const attachment = hasLocalMailAttachment(message);
          const filters = [
            encodeIdentity("a", batch.emailAccountId),
            ...labels.map((label) => encodeIdentity("l", label)),
            ...(visible ? ["visible"] : []),
            ...(attachment ? [ATTACHMENT_TOKEN] : []),
          ].join(" ");
          const longFilters = [
            encodeLongIdentity("a", batch.emailAccountId),
            ...labels.map((label) => encodeLongIdentity("l", label)),
            ...(visible ? ["vis"] : []),
            ...(attachment ? [LONG_ATTACHMENT_TOKEN] : []),
          ].join(" ");
          const texts = [
            fields.all_text,
            fields.from_text,
            fields.to_text,
            fields.subject_text,
          ];
          database.exec({
            sql: "INSERT INTO search_documents VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            bind: [
              rowId,
              batch.emailAccountId,
              message.id,
              message.threadId,
              received,
              ...texts,
              JSON.stringify(labels),
              Number(visible),
              Number(attachment),
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

function discardIndexSchema(database: Database) {
  const readTables = () =>
    database.exec({
      sql: "SELECT name, sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      rowMode: "object",
      returnValue: "resultRows",
    }) as { name: string; sql: string | null }[];
  const drop = (name: string) =>
    database.exec(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`);
  // Dropping an FTS5 table also drops its shadow tables, which cannot be
  // dropped on their own, so virtual tables go first.
  for (const table of readTables())
    if (table.sql?.startsWith("CREATE VIRTUAL TABLE")) drop(table.name);
  for (const table of readTables()) drop(table.name);
  database.exec("PRAGMA user_version=0");
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
  // The MATCH expression only narrows candidates, so it may be a superset of
  // the query: negation and any branch a tokenizer cannot express are dropped
  // from it and enforced by the exact checks below.
  const longText = compileMatch(parsed.node, { long: true, labels: false });
  const shortText = compileMatch(parsed.node, { long: false, labels: false });
  const long = longText !== undefined;
  const expression = compileMatch(parsed.node, { long, labels: true });
  const values: (string | number | bigint)[] = [request.emailAccountId];
  const checks = ["d.account=?"];
  if (!parsed.includeSpamTrash) checks.push("d.visible=1");
  checks.push(compileChecks(parsed.node, values));
  for (const node of getConjuncts(parsed.node)) {
    if (node.type !== "term") continue;
    const term = node.term;
    if (term.field !== "after" && term.field !== "before") continue;
    // Row ids order by received time, so a top-level date bound also stops the
    // ordered scan early. It is only sound outside a disjunction or negation.
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
  const primary = long ? "search_long" : "search_short";
  const match = [
    ...getBaseFilters(request.emailAccountId, parsed.includeSpamTrash, long),
    ...(expression ? [expression] : []),
  ].join(" AND ");
  // Terms below the trigram length only exist in the ascii-tokenized table.
  const secondaryMatch =
    long && shortText
      ? [
          ...getBaseFilters(
            request.emailAccountId,
            parsed.includeSpamTrash,
            false,
          ),
          shortText,
        ].join(" AND ")
      : undefined;
  const secondary = secondaryMatch ? "search_short" : undefined;
  const bind: BindingSpec = [
    match,
    ...(secondaryMatch ? [secondaryMatch] : []),
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

function getBaseFilters(
  emailAccountId: string,
  includeSpamTrash: boolean,
  long: boolean,
) {
  const identity = long
    ? encodeLongIdentity("a", emailAccountId)
    : encodeIdentity("a", emailAccountId);
  return [
    `filter_tokens:${quoteMatch(identity)}`,
    ...(includeSpamTrash
      ? []
      : [`filter_tokens:"${long ? "vis" : "visible"}"`]),
  ];
}

function getConjuncts(node: SearchNode): SearchNode[] {
  return node.type === "and" ? node.nodes.flatMap(getConjuncts) : [node];
}

/** Undefined means the node constrains nothing this tokenizer can express, so
 *  callers must widen rather than exclude. */
function compileMatch(
  node: SearchNode,
  options: { long: boolean; labels: boolean },
): string | undefined {
  if (node.type === "any" || node.type === "not") return;
  if (node.type === "and") {
    const parts = node.nodes.flatMap(
      (child) => compileMatch(child, options) ?? [],
    );
    if (!parts.length) return;
    return parts.length === 1 ? parts[0] : `(${parts.join(" AND ")})`;
  }
  if (node.type === "or") {
    const parts = node.nodes.map((child) => compileMatch(child, options));
    if (parts.some((part) => part === undefined)) return;
    return `(${parts.join(" OR ")})`;
  }
  const term = node.term;
  if (term.field === "after" || term.field === "before") return;
  if (term.field === "attachment")
    return `filter_tokens:"${options.long ? LONG_ATTACHMENT_TOKEN : ATTACHMENT_TOKEN}"`;
  if (term.field === "label") {
    // Archived Gmail mail carries no label of its own, so no token selects it.
    if (!options.labels || term.value === ARCHIVE_SEARCH_LABEL) return;
    const identity = options.long
      ? encodeLongIdentity("l", term.value)
      : encodeIdentity("l", term.value);
    return `filter_tokens:${quoteMatch(identity)}`;
  }
  const long = Array.from(term.value).length >= 3;
  if (long !== options.long) return;
  const value = long
    ? term.value.replaceAll("\0", "\uFFFD")
    : encodeShortQuery(term.value);
  return `${getSearchColumn(term.field)}:${quoteMatch(value)}`;
}

function compileChecks(
  node: SearchNode,
  values: (string | number | bigint)[],
): string {
  if (node.type === "any") return "1";
  // A document with no received time yields NULL rather than false, which
  // would otherwise make both a date bound and its negation reject it.
  if (node.type === "not")
    return `NOT COALESCE(${compileChecks(node.node, values)},0)`;
  if (node.type === "and" || node.type === "or") {
    const separator = node.type === "and" ? " AND " : " OR ";
    return `(${node.nodes.map((child) => compileChecks(child, values)).join(separator)})`;
  }
  const term = node.term;
  if (term.field === "after" || term.field === "before") {
    values.push(term.value);
    return `d.received${term.field === "after" ? ">" : "<"}?`;
  }
  if (term.field === "attachment") return "d.has_attachment=1";
  if (term.field === "label") {
    if (term.value === ARCHIVE_SEARCH_LABEL) return compileArchived(values);
    values.push(term.value);
    return "EXISTS (SELECT 1 FROM json_each(d.labels) WHERE value=?)";
  }
  values.push(term.value);
  return `instr(d.${getSearchColumn(term.field)},?)>0`;
}

/** The SQL counterpart of `isArchivedLocalMessage`. Both read the same label
 *  lists so the two search paths cannot answer `in:archive` differently. */
function compileArchived(values: (string | number | bigint)[]) {
  values.push(ARCHIVE_SEARCH_LABEL, ...LIVE_MAILBOX_LABELS);
  const live = LIVE_MAILBOX_LABELS.map(() => "?").join(",");
  return `(EXISTS (SELECT 1 FROM json_each(d.labels) WHERE value=?)
      OR (json_array_length(d.labels)>0
        AND NOT EXISTS (SELECT 1 FROM json_each(d.labels) WHERE value IN (${live}))))`;
}

function getSearchColumn(
  field: "text" | "from" | "to" | "subject",
): SearchField {
  if (field === "text") return "all_text";
  if (field === "from") return "from_text";
  return field === "to" ? "to_text" : "subject_text";
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
