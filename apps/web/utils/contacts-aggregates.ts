import type {
  CompanySummary,
  ContactListItem,
  DomainStat,
} from "@/utils/contacts";

export type CompanyStats = {
  people: number;
  received: number;
  sent: number;
  emails: number;
  lastInteractionAt: Date | null;
};

// A company's history rolled up across every domain it owns. Per-domain
// stats cover the full mail history; `members` is whatever the caller has
// loaded, which may be a recency window. Someone explicitly assigned to the
// company can email from a domain it doesn't own (a personal address, say),
// so their volume adds to the domain totals rather than being assumed to sit
// inside them.
export function rollUpCompanyStats({
  domains,
  domainStats,
  members,
}: {
  domains: string[];
  domainStats: DomainStat[];
  members: ContactListItem[];
}): CompanyStats {
  const owned = new Set(domains);
  const stats = domainStats.filter((stat) => owned.has(stat.domain));
  const offDomain = members.filter((member) => !owned.has(member.domain));

  const received =
    sumBy(stats, (stat) => stat.received) +
    sumBy(offDomain, (member) => member.receivedCount);
  const sent =
    sumBy(stats, (stat) => stat.sent) +
    sumBy(offDomain, (member) => member.sentCount);
  const people = Math.max(
    sumBy(stats, (stat) => stat.people) + offDomain.length,
    members.length,
  );

  const times = [
    ...stats.map((stat) => stat.lastInteractionAt),
    ...members.map((member) => member.lastInteractionAt),
  ]
    // Dates arrive as strings once the response has been through JSON
    .flatMap((date) => (date ? [new Date(date).getTime()] : []));

  return {
    people,
    received,
    sent,
    emails: received + sent,
    lastInteractionAt: times.length ? new Date(Math.max(...times)) : null,
  };
}

// People per label. A child label's people also count towards its parent, so
// a collapsed top-level row totals everything nested under it.
export function countPeopleByLabel(
  companies: { label: CompanySummary["label"]; people: number }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string, people: number) =>
    counts.set(id, (counts.get(id) ?? 0) + people);

  for (const { label, people } of companies) {
    if (!label) continue;
    add(label.id, people);
    if (label.parent) add(label.parent.id, people);
  }

  return counts;
}

function sumBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}
