-- These tables grow into the tens of millions of rows. At the default 10%
-- analyze threshold, planner statistics go stale for long stretches, which
-- led to bad plans for draft cleanup queries. Re-analyze after ~1% changes.
ALTER TABLE "ExecutedAction" SET (autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE "ExecutedRule" SET (autovacuum_analyze_scale_factor = 0.01);
