import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `bump_rules_revision_from_rule` fires on `UPDATE OF <explicit column list>`.
 * Any Rule column that changes how the rule matches must be in that list, or
 * editing it leaves `EmailAccount.rulesRevision` untouched and the assistant
 * chat keeps serving a stale rule snapshot for the rest of the conversation --
 * the user changes a filter and nothing happens.
 *
 * That is exactly how `fromExclude`, `toExclude`, `subjectExclude`,
 * `subjectMatchMode` and `excludeKnownContacts` were missed when they were
 * added. This test fails when a new matching column is introduced without
 * being wired into the trigger.
 */

const PRISMA_DIR = path.join(process.cwd(), "prisma");

// Rule columns that genuinely do not affect matching. Anything not listed here
// must appear in the trigger. Add to this list only with a reason.
const COLUMNS_THAT_DO_NOT_AFFECT_MATCHING = new Set([
  "id",
  "createdAt",
  "updatedAt",
  // Scope, not matching: the trigger is per emailAccount already.
  "emailAccountId",
  // Org linkage. `enabled` is always co-written when a member toggles an org
  // rule copy, and `enabled` is in the trigger list.
  "organizationRuleId",
  "organizationRuleMemberEnabled",
]);

describe("bump_rules_revision_from_rule", () => {
  it("covers every Rule column that affects matching", () => {
    const triggerColumns = getTriggerColumns();
    const ruleColumns = getRuleScalarColumns();

    const missing = ruleColumns.filter(
      (column) =>
        !COLUMNS_THAT_DO_NOT_AFFECT_MATCHING.has(column) &&
        !triggerColumns.includes(column),
    );

    expect(missing).toEqual([]);
  });

  it("does not name columns that no longer exist on Rule", () => {
    const ruleColumns = getRuleScalarColumns();
    const stale = getTriggerColumns().filter(
      (column) => !ruleColumns.includes(column),
    );

    expect(stale).toEqual([]);
  });
});

/** The `UPDATE OF (...)` column list from the most recent trigger definition. */
function getTriggerColumns(): string[] {
  const definitions = readdirSync(path.join(PRISMA_DIR, "migrations"))
    .sort()
    .map((dir) =>
      readMigration(path.join(PRISMA_DIR, "migrations", dir, "migration.sql")),
    )
    .filter((sql) =>
      sql.includes("CREATE TRIGGER bump_rules_revision_from_rule"),
    );

  const latest = definitions.at(-1);
  if (!latest) throw new Error("No migration creates the trigger");

  const updateOf = latest
    .slice(latest.lastIndexOf("CREATE TRIGGER bump_rules_revision_from_rule"))
    .match(/UPDATE OF([\s\S]*?)ON "Rule"/);
  if (!updateOf) throw new Error("Could not parse the trigger column list");

  return updateOf[1]
    .split(",")
    .map((column) => column.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

/** Scalar (non-relation) column names on the Prisma `Rule` model. */
function getRuleScalarColumns(): string[] {
  const schema = readFileSync(path.join(PRISMA_DIR, "schema.prisma"), "utf8");
  const model = schema.match(/^model Rule \{([\s\S]*?)^\}/m);
  if (!model) throw new Error("Could not find the Rule model");

  const relationTypes =
    /^(Action|AttachmentSource|EmailAccount|OrganizationRule|ExecutedRule|ClassificationFeedback|Group|RuleHistory)\b/;

  return model[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => line && !line.startsWith("@@") && !line.startsWith("//"))
    .map((line) => line.split(/\s+/))
    .filter(([, type]) => type && !relationTypes.test(type))
    .map(([name]) => name);
}

function readMigration(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
