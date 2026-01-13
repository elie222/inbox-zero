-- Update conversation status rules from old defaults to new defaults

UPDATE "Rule" SET "instructions" = 'Emails I need to respond to'
WHERE "systemType" = 'TO_REPLY' 
  AND ("instructions" = 'Emails you need to respond to'
    OR "instructions" IS NULL
    OR "instructions" = '');

UPDATE "Rule" SET "instructions" = 'Important emails I should know about, but don''t need to reply to'
WHERE "systemType" = 'FYI' 
  AND ("instructions" = 'Emails that don''t require your response, but are important'
    OR "instructions" IS NULL
    OR "instructions" = '');

UPDATE "Rule" SET "instructions" = 'Emails where I''m waiting for someone to get back to me'
WHERE "systemType" = 'AWAITING_REPLY' 
  AND ("instructions" = 'Emails you''re expecting a reply to'
    OR "instructions" IS NULL
    OR "instructions" = '');

UPDATE "Rule" SET "instructions" = 'Conversations that are done, nothing left to do'
WHERE "systemType" = 'ACTIONED' 
  AND ("instructions" = 'Email threads that have been resolved'
    OR "instructions" IS NULL
    OR "instructions" = '');
