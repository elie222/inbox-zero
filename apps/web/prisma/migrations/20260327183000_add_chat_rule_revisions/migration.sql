ALTER TABLE "EmailAccount"
ADD COLUMN "rulesRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Chat"
ADD COLUMN "lastSeenRulesRevision" INTEGER;

CREATE OR REPLACE FUNCTION bump_rules_revision_for_email_account(
  p_email_account_id TEXT
)
RETURNS VOID AS $$
BEGIN
  IF p_email_account_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE "EmailAccount"
  SET
    "rulesRevision" = "rulesRevision" + 1
  WHERE id = p_email_account_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bump_rules_revision_for_rule(
  p_rule_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_email_account_id TEXT;
BEGIN
  IF p_rule_id IS NULL THEN
    RETURN;
  END IF;

  SELECT "emailAccountId"
  INTO v_email_account_id
  FROM "Rule"
  WHERE id = p_rule_id;

  PERFORM bump_rules_revision_for_email_account(v_email_account_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION bump_rules_revision_for_group(
  p_group_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_email_account_id TEXT;
BEGIN
  IF p_group_id IS NULL THEN
    RETURN;
  END IF;

  SELECT g."emailAccountId"
  INTO v_email_account_id
  FROM "Group" g
  WHERE g.id = p_group_id;

  PERFORM bump_rules_revision_for_email_account(v_email_account_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bump_rules_revision_from_rule()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM bump_rules_revision_for_email_account(COALESCE(NEW."emailAccountId", OLD."emailAccountId"));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bump_rules_revision_from_action()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM bump_rules_revision_for_rule(COALESCE(NEW."ruleId", OLD."ruleId"));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bump_rules_revision_from_group()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM bump_rules_revision_for_group(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_bump_rules_revision_from_group_item()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM bump_rules_revision_for_group(COALESCE(NEW."groupId", OLD."groupId"));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bump_rules_revision_from_rule
AFTER INSERT OR DELETE OR UPDATE OF
  name,
  enabled,
  automate,
  "runOnThreads",
  "conditionalOperator",
  instructions,
  "groupId",
  "from",
  "to",
  subject,
  body,
  "categoryFilterType",
  "systemType",
  "promptText"
ON "Rule"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_rule();

CREATE TRIGGER bump_rules_revision_from_action
AFTER INSERT OR DELETE OR UPDATE OF
  type,
  label,
  "labelId",
  subject,
  content,
  "to",
  cc,
  bcc,
  url,
  "folderName",
  "folderId",
  "delayInMinutes",
  "staticAttachments",
  "ruleId"
ON "Action"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_action();

CREATE TRIGGER bump_rules_revision_from_group
AFTER INSERT OR DELETE OR UPDATE OF
  name,
  prompt,
  "emailAccountId"
ON "Group"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_group();

CREATE TRIGGER bump_rules_revision_from_group_item
AFTER INSERT OR DELETE OR UPDATE OF
  "groupId",
  type,
  value,
  exclude,
  reason,
  "threadId",
  "messageId",
  source
ON "GroupItem"
FOR EACH ROW
EXECUTE FUNCTION trg_bump_rules_revision_from_group_item();
