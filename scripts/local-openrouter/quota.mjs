import { DatabaseSync } from "node:sqlite";

// SQLite transactions coordinate concurrent gateway processes and survive restarts.
export function createQuota(path, { perMinute = 20, perDay = 50, newMailReserve = 0 } = {}) {
  for (const limit of [perMinute, perDay]) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("Request limits must be positive integers");
    }
  }
  if (!Number.isSafeInteger(newMailReserve) || newMailReserve < 0 || newMailReserve > perDay) throw new Error("Invalid new-mail reserve");
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS daily(day TEXT PRIMARY KEY, used INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS requests(at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS requests_at ON requests(at);
    CREATE TABLE IF NOT EXISTS cooldown(id INTEGER PRIMARY KEY CHECK(id=1), until INTEGER NOT NULL, calls INTEGER NOT NULL DEFAULT 0);
  `);
  for (const column of ["backfill_used", "priority_used"]) {
    if (!db.prepare("PRAGMA table_info(daily)").all().some(field => field.name === column)) db.exec(`ALTER TABLE daily ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  }
  if (!db.prepare("PRAGMA table_info(cooldown)").all().some(column => column.name === "calls")) {
    db.exec("ALTER TABLE cooldown ADD COLUMN calls INTEGER NOT NULL DEFAULT 0");
  }
  db.prepare("INSERT OR IGNORE INTO cooldown(id,until,calls) VALUES(1,0,0)").run();

  function status(now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10);
    const usage = db.prepare("SELECT * FROM daily WHERE day = ?").get(day);
    const dailyUsed = usage?.used ?? 0;
    const backfillUsed = usage?.backfill_used ?? 0;
    const priorityUsed = usage?.priority_used ?? 0;
    const protectedRemaining = Math.max(0,newMailReserve-priorityUsed);
    const backfillLimit = perDay-newMailReserve;
    const backfillRemaining = Math.max(0,Math.min(backfillLimit-backfillUsed,perDay-dailyUsed-protectedRemaining));
    const minuteUsed = db.prepare("SELECT COUNT(*) AS count FROM requests WHERE at > ?").get(now - 60_000).count;
    const batch = db.prepare("SELECT until,calls FROM cooldown WHERE id=1").get();
    const cooldownUntil = batch.until;
    const nextResetAt = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString();
    return { day, dailyUsed, minuteUsed, perMinute, perDay, newMailReserve, backfillLimit, backfillUsed, priorityUsed, backfillRemaining, priorityRemaining:Math.max(0,perDay-dailyUsed), batchUsed: batch.calls, nextResetAt, cooldownUntil: cooldownUntil > now ? cooldownUntil : null };
  }

  return {
    status,
    syncDailyFloor(used, now = Date.now()) {
      if (!Number.isSafeInteger(used) || used < 0) return;
      const day = new Date(now).toISOString().slice(0, 10);
      db.prepare(`INSERT INTO daily(day, used) VALUES(?, ?)
        ON CONFLICT(day) DO UPDATE SET used = MAX(daily.used, excluded.used)`).run(day, used);
    },
    reserve(now = Date.now(), workload = "priority") {
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = status(now);
        if (current.dailyUsed >= perDay) {
          db.exec("COMMIT");
          return {
            allowed: false,
            reason: "daily",
            retryAfter: Math.ceil((Date.parse(`${current.day}T00:00:00Z`) + 86_400_000 - now) / 1000),
            ...current,
          };
        }
        if (workload === "backfill" && current.backfillRemaining <= 0) {
          db.exec("COMMIT");
          return {allowed:false,reason:"backfill",retryAfter:Math.ceil((Date.parse(current.nextResetAt)-now)/1000),...current};
        }
        if (current.cooldownUntil) {
          db.exec("COMMIT");
          return { allowed: false, reason: "minute", retryAfter: Math.max(1, Math.ceil((current.cooldownUntil-now)/1000)), ...current };
        }
        if (current.minuteUsed >= perMinute) {
          const oldest = db.prepare("SELECT MIN(at) AS at FROM requests WHERE at > ?").get(now - 60_000).at;
          db.exec("COMMIT");
          return { allowed: false, reason: "minute", retryAfter: Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000)), ...current };
        }
        db.prepare(`INSERT INTO daily(day, used) VALUES(?, 1)
          ON CONFLICT(day) DO UPDATE SET used = daily.used + 1`).run(current.day);
        const counter = workload === "backfill" ? "backfill_used" : "priority_used";
        db.prepare(`UPDATE daily SET ${counter}=${counter}+1 WHERE day=?`).run(current.day);
        db.prepare("INSERT INTO requests(at) VALUES(?)").run(now);
        const batchUsed = current.batchUsed >= perMinute ? 1 : current.batchUsed + 1;
        db.prepare("UPDATE cooldown SET calls=?,until=? WHERE id=1").run(batchUsed,batchUsed >= perMinute ? now+60_000 : 0);
        db.prepare("DELETE FROM requests WHERE at <= ?").run(now - 60_000);
        db.exec("COMMIT");
        return { allowed: true, ...current, dailyUsed: current.dailyUsed + 1, minuteUsed: current.minuteUsed + 1 };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => db.close(),
  };
}
