-- Find all rules with trackReplies=true and add TRACK_THREAD actions for them

-- Insert TRACK_THREAD actions for all rules with trackReplies=true
-- that don't already have a TRACK_THREAD action
INSERT INTO "Action" (id, "createdAt", "updatedAt", type, "ruleId")
SELECT 
  gen_random_uuid() as id,
  NOW() as "createdAt",
  NOW() as "updatedAt",
  'TRACK_THREAD' as type,
  r.id as "ruleId"
FROM "Rule" r
WHERE r."trackReplies" = true
AND NOT EXISTS (
  SELECT 1 FROM "Action" a 
  WHERE a."ruleId" = r.id 
  AND a.type = 'TRACK_THREAD'
);
