-- Learned patterns (Group/GroupItem) are written constantly by background
-- email processing, and they are not part of the rule snapshot the assistant
-- chat reads. Bumping rulesRevision for them invalidated chat rule state
-- mid-conversation and forced fresh rule context reinjection on every turn.
-- Keep the Rule/Action triggers: they cover everything the snapshot exposes.

DROP TRIGGER IF EXISTS bump_rules_revision_from_group_item ON "GroupItem";
DROP TRIGGER IF EXISTS bump_rules_revision_from_group ON "Group";

DROP FUNCTION IF EXISTS trg_bump_rules_revision_from_group_item();
DROP FUNCTION IF EXISTS trg_bump_rules_revision_from_group();
DROP FUNCTION IF EXISTS bump_rules_revision_for_group(TEXT);
