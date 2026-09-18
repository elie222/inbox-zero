import type { SqlTransaction } from "./driver";

export const MAILBOX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS profile_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  database_epoch TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  owner_fence TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  generation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  version TEXT,
  subject TEXT NOT NULL,
  preview TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  read INTEGER NOT NULL CHECK (read IN (0, 1)),
  starred INTEGER NOT NULL CHECK (starred IN (0, 1)),
  folder_id TEXT,
  label_ids_json TEXT NOT NULL,
  category_ids_json TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  in_inbox INTEGER NOT NULL CHECK (in_inbox IN (0, 1)),
  in_sent INTEGER NOT NULL CHECK (in_sent IN (0, 1)),
  in_draft INTEGER NOT NULL CHECK (in_draft IN (0, 1)),
  in_trash INTEGER NOT NULL CHECK (in_trash IN (0, 1)),
  in_spam INTEGER NOT NULL CHECK (in_spam IN (0, 1)),
  has_attachments INTEGER NOT NULL CHECK (has_attachments IN (0, 1)),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  PRIMARY KEY (account_id, message_id),
  FOREIGN KEY (account_id) REFERENCES accounts(account_id)
);

CREATE TABLE IF NOT EXISTS message_content (
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  version TEXT,
  html TEXT,
  text TEXT,
  PRIMARY KEY (account_id, message_id)
);

CREATE TABLE IF NOT EXISTS effective_messages (
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_json TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  read INTEGER NOT NULL,
  starred INTEGER NOT NULL,
  folder_id TEXT,
  label_ids_json TEXT NOT NULL,
  category_ids_json TEXT NOT NULL,
  roles_json TEXT NOT NULL,
  in_inbox INTEGER NOT NULL,
  in_sent INTEGER NOT NULL,
  in_draft INTEGER NOT NULL,
  in_trash INTEGER NOT NULL,
  in_spam INTEGER NOT NULL,
  has_attachments INTEGER NOT NULL,
  pending_operation_ids_json TEXT NOT NULL,
  PRIMARY KEY (account_id, message_id)
);

CREATE TABLE IF NOT EXISTS operations (
  account_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  status TEXT NOT NULL,
  authority TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  executable_hash TEXT,
  payload_json TEXT NOT NULL,
  executable_payload_json TEXT,
  observed_epoch TEXT,
  observed_sequence INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER,
  error_code TEXT,
  error_retryable INTEGER,
  receipt_id TEXT,
  resolution_id TEXT,
  claimed_by TEXT,
  claimed_until_ms INTEGER,
  attempt_id TEXT,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (account_id, command_id)
);

CREATE TABLE IF NOT EXISTS operation_targets (
  account_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  conversation_id TEXT,
  outcome TEXT,
  code TEXT,
  PRIMARY KEY (account_id, command_id, message_id)
);

CREATE TABLE IF NOT EXISTS operation_conversations (
  account_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  resolution_id TEXT NOT NULL,
  next_page TEXT,
  complete INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, command_id, conversation_id)
);

CREATE TABLE IF NOT EXISTS drafts (
  account_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  frozen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, draft_id)
);

CREATE TABLE IF NOT EXISTS sync_streams (
  account_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  generation TEXT NOT NULL,
  checkpoint TEXT,
  PRIMARY KEY (account_id, stream_id)
);

CREATE TABLE IF NOT EXISTS coverage (
  account_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  metadata TEXT NOT NULL,
  content TEXT NOT NULL,
  indexed_content TEXT NOT NULL,
  last_completed_sync_at_ms INTEGER,
  PRIMARY KEY (account_id, scope_id)
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  job_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  retry_at_ms INTEGER,
  claimed_by TEXT,
  claimed_until_ms INTEGER
);

CREATE TABLE IF NOT EXISTS conversation_completeness (
  account_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  complete INTEGER NOT NULL,
  PRIMARY KEY (account_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS effective_inbox_order
  ON effective_messages(account_id, in_inbox, received_at_ms DESC, conversation_id, message_id);
CREATE INDEX IF NOT EXISTS effective_conversation
  ON effective_messages(account_id, conversation_id, received_at_ms DESC);
CREATE INDEX IF NOT EXISTS operations_status
  ON operations(status, next_attempt_at_ms);
CREATE INDEX IF NOT EXISTS messages_conversation
  ON messages(account_id, conversation_id);
`;

export const MAILBOX_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  account_id UNINDEXED,
  message_id UNINDEXED,
  subject,
  preview,
  from_address,
  body,
  tokenize = 'unicode61'
);
`;

export async function migrateMailbox(
  tx: SqlTransaction,
  epoch: string,
): Promise<void> {
  await tx.exec(MAILBOX_SCHEMA_SQL);
  try {
    await tx.exec("SAVEPOINT fts_create");
    await tx.exec(MAILBOX_FTS_SQL);
    await tx.exec("RELEASE fts_create");
  } catch {
    try {
      await tx.exec("ROLLBACK TO fts_create");
    } catch {
      // savepoint missing
    }
  }
  const existing = await tx.query(
    "SELECT database_epoch FROM profile_state WHERE id = 1",
  );
  if (existing.length === 0) {
    await tx.execute(
      "INSERT INTO profile_state(id, database_epoch, sequence, owner_fence) VALUES (1, ?, 0, NULL)",
      [epoch],
    );
  }
  await tx.execute(
    "INSERT OR IGNORE INTO schema_migrations(id, name) VALUES (1, '0001-mailbox')",
  );
}
