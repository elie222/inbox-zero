import type {
  ResponseTimeResponse,
  Rule,
  StatsByPeriodResponse,
} from "./api-types";

export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printRulesTable(rules: Rule[]) {
  if (rules.length === 0) {
    process.stdout.write("No rules found.\n");
    return;
  }

  process.stdout.write("ID\tENABLED\tACTIONS\tNAME\n");
  for (const rule of rules) {
    process.stdout.write(
      `${rule.id}\t${rule.enabled ? "yes" : "no"}\t${rule.actions.length}\t${rule.name}\n`,
    );
  }
}

export function printStatsByPeriod(result: StatsByPeriodResponse) {
  process.stdout.write(
    `Emails: ${result.allCount} total, ${result.inboxCount} inbox, ${result.readCount} read, ${result.sentCount} sent\n`,
  );

  for (const period of result.result) {
    process.stdout.write(
      `${period.startOfPeriod}: all=${period.All} unread=${period.Unread} archived=${period.Archived}\n`,
    );
  }
}

export function printResponseTime(result: ResponseTimeResponse) {
  process.stdout.write(
    `Emails analyzed: ${result.emailsAnalyzed}/${result.maxEmailsCap}\n`,
  );
  process.stdout.write(
    `Median response time: ${result.summary.medianResponseTime} minutes\n`,
  );
  process.stdout.write(
    `Average response time: ${result.summary.averageResponseTime} minutes\n`,
  );
  process.stdout.write(`Within 1 hour: ${result.summary.within1Hour}%\n`);
}
