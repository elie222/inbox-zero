// The UPDATE is one SQLite statement so concurrent dispatchers cannot claim
// the same email. A bounded lease lets interrupted work resume after a restart.
export function claimNextJob(db,accountId,now=Date.now()) {
  return db.prepare(`UPDATE jobs SET retry_at=? WHERE rowid=(
    SELECT rowid FROM jobs WHERE account_id=? AND done=0 AND retry_at<=?
    ORDER BY received_at DESC LIMIT 1
  ) RETURNING *`).get(now+600_000,accountId,now);
}

export function initializeBatchQueue(db,now=Date.now()) {
  db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,cursor TEXT,exhausted INTEGER NOT NULL DEFAULT 0,configured INTEGER NOT NULL DEFAULT 0,head_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(account_id TEXT NOT NULL,message_id TEXT NOT NULL,thread_id TEXT NOT NULL,received_at INTEGER NOT NULL,done INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,message_id));`);
  const oldKey=db.prepare('PRAGMA table_info(jobs)').all().some(column=>column.name==='thread_id' && column.pk>0);
  if(oldKey){
    db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE jobs RENAME TO jobs_legacy;
      CREATE TABLE jobs(account_id TEXT NOT NULL,message_id TEXT NOT NULL,thread_id TEXT NOT NULL,received_at INTEGER NOT NULL,done INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(account_id,message_id));
      INSERT INTO jobs SELECT account_id,message_id,thread_id,received_at,done,attempts,retry_at FROM jobs_legacy;
      DROP TABLE jobs_legacy;
      UPDATE accounts SET cursor=NULL,exhausted=0,head_at=0;
      COMMIT;`);
  }
  for(const [column,type] of [['head_after','INTEGER NOT NULL DEFAULT 0'],['head_started','INTEGER NOT NULL DEFAULT 0'],['head_cursor','TEXT']]){
    if(!db.prepare('PRAGMA table_info(accounts)').all().some(field=>field.name===column)) db.exec(`ALTER TABLE accounts ADD COLUMN ${column} ${type}`);
  }
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('new_mail_since',?)").run(String(now));
  db.exec('CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(account_id,done,retry_at,received_at)');
  return Number(db.prepare("SELECT value FROM settings WHERE key='new_mail_since'").get().value);
}

export function enqueueMessages(db,accountId,messages) {
  const insert=db.prepare(`INSERT INTO jobs(account_id,message_id,thread_id,received_at) VALUES(?,?,?,?)
    ON CONFLICT(account_id,message_id) DO UPDATE SET received_at=MAX(jobs.received_at,excluded.received_at),thread_id=excluded.thread_id`);
  db.exec('BEGIN IMMEDIATE');
  try {for(const message of messages)insert.run(accountId,message.id,message.threadId,message.receivedAt);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
}

export function claimEmailBatch(db,{accountId,cutoff,priority,limit=10,now=Date.now()}) {
  if(!Number.isSafeInteger(limit)||limit<1||limit>10)throw new Error('Invalid batch size');
  const comparison=priority?'>=':'<';
  return db.prepare(`UPDATE jobs SET retry_at=? WHERE rowid IN (
    SELECT rowid FROM jobs WHERE account_id=? AND done=0 AND retry_at<=? AND received_at ${comparison} ?
    ORDER BY received_at DESC LIMIT ?
  ) RETURNING *`).all(now+600000,accountId,now,cutoff,limit);
}
