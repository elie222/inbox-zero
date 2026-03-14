type RuleSummary = {
  id: string;
  name: string;
  enabled: boolean;
  actionCount: number;
};

type StatsByPeriodResult = {
  result: Array<{
    startOfPeriod: string;
    All: number;
    Sent: number;
    Read: number;
    Unread: number;
    Unarchived: number;
    Archived: number;
  }>;
  allCount: number;
  inboxCount: number;
  readCount: number;
  sentCount: number;
};

type ResponseTimeResult = {
  summary: {
    medianResponseTime: number;
    averageResponseTime: number;
    within1Hour: number;
  };
  emailsAnalyzed: number;
};

export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printRulesTable(rules: RuleSummary[]) {
  if (rules.length === 0) {
    process.stdout.write("No rules found.\n");
    return;
  }

  process.stdout.write("ID\tENABLED\tACTIONS\tNAME\n");
  for (const rule of rules) {
    process.stdout.write(
      `${rule.id}\t${rule.enabled ? "yes" : "no"}\t${rule.actionCount}\t${rule.name}\n`,
    );
  }
}

export function printStatsByPeriod(result: StatsByPeriodResult) {
  process.stdout.write(
    `Emails: ${result.allCount} total, ${result.inboxCount} inbox, ${result.readCount} read, ${result.sentCount} sent\n`,
  );

  for (const period of result.result) {
    process.stdout.write(
      `${period.startOfPeriod}: all=${period.All} unread=${period.Unread} archived=${period.Archived}\n`,
    );
  }
}

export function printResponseTime(result: ResponseTimeResult) {
  process.stdout.write(`Emails analyzed: ${result.emailsAnalyzed}\n`);
  process.stdout.write(
    `Median response time: ${result.summary.medianResponseTime}\n`,
  );
  process.stdout.write(
    `Average response time: ${result.summary.averageResponseTime}\n`,
  );
  process.stdout.write(`Within 1 hour: ${result.summary.within1Hour}\n`);
}
