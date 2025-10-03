-- ========================================
-- Migration: Convert automate=false to disabled rules
-- ========================================
-- This migration removes the pending tasks/approval feature.
-- All rules are now fully automated in the application logic.
--
-- Changes:
-- 1. Disable all rules that had automate=false
-- 2. Mark any pending/rejected ExecutedRules as SKIPPED
--
-- Note: We're keeping the 'automate' field in the database for now
-- but it's no longer used by the application.
-- ========================================

-- Step 1: Disable rules that required manual approval (automate=false)
-- These rules are converted to disabled since manual approval is no longer supported
UPDATE "Rule" 
SET enabled = false 
WHERE automate = false;

-- Step 2: Clean up any pending or rejected ExecutedRules
-- Mark them as SKIPPED since they'll never be approved/rejected now
UPDATE "ExecutedRule" 
SET status = 'SKIPPED' 
WHERE status IN ('PENDING', 'REJECTED');
