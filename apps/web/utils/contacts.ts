import { isPublicEmailDomain } from "@/utils/email";

// No email in or out for this long → the relationship may be going stale
export const STALE_AFTER_DAYS = 90;

export type ContactActivity = {
  email: string;
  name: string | null;
  receivedCount: number;
  sentCount: number;
  lastInteractionAt: Date;
};

export type SavedContact = {
  email: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  aiSummary: string | null;
  photoUrl: string | null;
  useCompanyLogo: boolean;
  isPersonal: boolean;
  companyId: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  domains: string[];
  logoUrl: string | null;
  // Render the logo on a white chip (dark marks vanish on the dark theme)
  logoWhiteBackground: boolean;
  label: {
    id: string;
    name: string;
    parent: { id: string; name: string } | null;
  } | null;
};

export type ContactListItem = {
  email: string;
  domain: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  aiSummary: string | null;
  photoUrl: string | null;
  useCompanyLogo: boolean;
  isPersonal: boolean;
  companyId: string | null;
  receivedCount: number;
  sentCount: number;
  lastInteractionAt: Date | null;
  stale: boolean;
  isSaved: boolean;
};

export type ContactGroup = {
  // Company id, "domain:<domain>" for auto groups, "personal", or "other"
  key: string;
  name: string;
  logoUrl: string | null;
  domains: string[];
  company: CompanySummary | null;
  contacts: ContactListItem[];
};

export function mergeContactActivity({
  activity,
  saved,
  now = new Date(),
}: {
  activity: ContactActivity[];
  saved: SavedContact[];
  now?: Date;
}): ContactListItem[] {
  const savedByEmail = new Map(
    saved.map((contact) => [contact.email.toLowerCase(), contact]),
  );

  const toItem = (
    email: string,
    entry: ContactActivity | null,
    savedContact: SavedContact | undefined,
  ): ContactListItem => {
    const lastInteractionAt = entry?.lastInteractionAt ?? null;
    return {
      email,
      domain: emailDomain(email),
      name: savedContact?.name || entry?.name || null,
      title: savedContact?.title ?? null,
      phone: savedContact?.phone ?? null,
      notes: savedContact?.notes ?? null,
      aiSummary: savedContact?.aiSummary ?? null,
      photoUrl: savedContact?.photoUrl ?? null,
      useCompanyLogo: savedContact?.useCompanyLogo ?? true,
      isPersonal: savedContact?.isPersonal ?? false,
      companyId: savedContact?.companyId ?? null,
      receivedCount: entry?.receivedCount ?? 0,
      sentCount: entry?.sentCount ?? 0,
      lastInteractionAt,
      stale: isStale(lastInteractionAt, now),
      isSaved: !!savedContact,
    };
  };

  const merged = activity.map((entry) => {
    const email = entry.email.toLowerCase();
    const savedContact = savedByEmail.get(email);
    if (savedContact) savedByEmail.delete(email);
    return toItem(email, entry, savedContact);
  });

  // Saved contacts with no email activity (e.g. added manually)
  for (const savedContact of savedByEmail.values()) {
    merged.push(toItem(savedContact.email.toLowerCase(), null, savedContact));
  }

  return merged;
}

// The domain half of an email address, normalized the same way company
// domains are stored (lowercased upstream, "www." stripped)
export function emailDomain(email: string): string {
  return (email.split("@")[1] ?? "").replace(/^www\./, "");
}

// The company that owns an email domain; public provider domains (gmail.com
// etc.) are never owned
export function companyOwningDomain<T extends Pick<CompanySummary, "domains">>(
  domain: string,
  companies: T[],
): T | null {
  if (!domain || isPublicEmailDomain(domain)) return null;
  return companies.find((company) => company.domains.includes(domain)) ?? null;
}

// Explicit assignment wins; otherwise a company claims contacts through its
// domains. Personal contacts never group by company.
export function resolveContactCompany(
  contact: Pick<ContactListItem, "companyId" | "domain" | "isPersonal">,
  companies: CompanySummary[],
): CompanySummary | null {
  if (contact.isPersonal) return null;
  if (contact.companyId) {
    return (
      companies.find((company) => company.id === contact.companyId) ?? null
    );
  }
  return companyOwningDomain(contact.domain, companies);
}

export function groupContacts({
  contacts,
  companies,
}: {
  contacts: ContactListItem[];
  companies: CompanySummary[];
}): ContactGroup[] {
  const groups = new Map<string, ContactGroup>();

  const groupFor = (contact: ContactListItem): ContactGroup => {
    if (contact.isPersonal) {
      return upsertGroup(groups, {
        key: "personal",
        name: "Personal",
        logoUrl: null,
        domains: [],
        company: null,
      });
    }

    const company = resolveContactCompany(contact, companies);
    if (company) {
      return upsertGroup(groups, {
        key: company.id,
        name: company.name,
        logoUrl:
          company.logoUrl ||
          (company.domains[0] ? domainLogoUrl(company.domains[0]) : null),
        domains: company.domains,
        company,
      });
    }

    if (contact.domain && !isPublicEmailDomain(contact.domain)) {
      return upsertGroup(groups, {
        key: `domain:${contact.domain}`,
        name: contact.domain,
        logoUrl: domainLogoUrl(contact.domain),
        domains: [contact.domain],
        company: null,
      });
    }

    return upsertGroup(groups, {
      key: "other",
      name: "Other",
      logoUrl: null,
      domains: [],
      company: null,
    });
  };

  for (const contact of contacts) {
    groupFor(contact).contacts.push(contact);
  }

  // Companies with no derived members still show (they may be newly created)
  for (const company of companies) {
    if (!groups.has(company.id)) {
      upsertGroup(groups, {
        key: company.id,
        name: company.name,
        logoUrl:
          company.logoUrl ||
          (company.domains[0] ? domainLogoUrl(company.domains[0]) : null),
        domains: company.domains,
        company,
      });
    }
  }

  const special = ["personal", "other"];
  return [...groups.values()].sort((a, b) => {
    const aSpecial = special.indexOf(a.key);
    const bSpecial = special.indexOf(b.key);
    if (aSpecial !== bSpecial)
      return (aSpecial + 1 || 99) - (bSpecial + 1 || 99);
    // Companies read A→Z (case-insensitive, natural numbers) so the list
    // is scannable and stable instead of reshuffling with email volume
    return a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

// Per-domain aggregates over the full mail history, used by the Suggested
// view and company stats (already sorted by email volume, automated senders
// excluded)
export type DomainStat = {
  domain: string;
  people: number;
  emails: number;
  received: number;
  sent: number;
  lastInteractionAt: Date | null;
};

// Domains that haven't been added as (or to) a company and haven't been
// dismissed — the "Suggested" list. Shared by the page, the tab count, and
// the sidebar so they can't drift apart.
export function pendingDomainStats(
  stats: DomainStat[],
  companies: Pick<CompanySummary, "domains">[],
  ignoredDomains: string[],
): DomainStat[] {
  const taken = new Set([
    ...ignoredDomains,
    ...companies.flatMap((company) => company.domains),
  ]);
  return stats.filter((stat) => !taken.has(stat.domain));
}

// Heuristic for machine mailboxes: suggestions should surface real people,
// not no-reply addresses, alert streams, or plus-addressed robots. This is a
// deliberate product guard on address shape, not content.
const AUTOMATED_LOCAL_PARTS = new Set([
  "mailer-daemon",
  "postmaster",
  "bounce",
  "bounces",
  "notification",
  "notifications",
  "alert",
  "alerts",
  "newsletter",
  "newsletters",
  "news",
  "updates",
  "digest",
  "marketing",
  "billing",
  "invoice",
  "invoices",
  "receipt",
  "receipts",
  "statement",
  "statements",
  "reminder",
  "reminders",
]);
const NO_REPLY_PATTERN =
  /no[-._]?repl(y|ies)|do[-._]?not[-._]?reply|dont[-._]?reply|donotreply|unattended|automated/i;
const AUTOMATED_DOMAIN_LABEL =
  /alert|notif|no-?reply|donotreply|bounce|mailer|newsletter|marketing|transactional/i;

export function isLikelyAutomatedSender(email: string): boolean {
  const [localPart = "", domain = ""] = email.toLowerCase().split("@");

  if (NO_REPLY_PATTERN.test(localPart)) return true;
  // Plus-addressing on inbound senders (invoice+statements@…) is a robot tag
  if (localPart.includes("+")) return true;
  if (AUTOMATED_LOCAL_PARTS.has(localPart)) return true;

  // Sending-infrastructure subdomains: costalerts.amazonaws.com, mailer.x.com
  const labels = domain.split(".").slice(0, -1);
  return labels.some((label) => AUTOMATED_DOMAIN_LABEL.test(label));
}

// Served by our SSRF-guarded provider chain (logo.dev → Clearbit →
// DuckDuckGo → the domain's own icons → Google favicons) so the browser
// never talks to those services directly. See app/api/public/logo.
export function domainLogoUrl(domain: string) {
  return `/api/public/logo?domain=${encodeURIComponent(domain)}`;
}

// The avatar shown for a contact: company logo by default, personal photo
// when the contact opted out of the company logo (or has no company)
export function contactAvatarUrl(
  contact: Pick<
    ContactListItem,
    "photoUrl" | "useCompanyLogo" | "isPersonal" | "companyId" | "domain"
  >,
  companies: CompanySummary[],
): string | null {
  if (contact.useCompanyLogo && !contact.isPersonal) {
    const company = resolveContactCompany(contact, companies);
    const companyLogo =
      company &&
      (company.logoUrl ||
        (company.domains[0] ? domainLogoUrl(company.domains[0]) : null));
    if (companyLogo) return companyLogo;
    // No saved company: the contact's own work domain still has a logo
    if (contact.domain && !isPublicEmailDomain(contact.domain)) {
      return domainLogoUrl(contact.domain);
    }
  }
  return contact.photoUrl;
}

function isStale(lastInteractionAt: Date | null, now: Date) {
  if (!lastInteractionAt) return false;
  const staleBefore = new Date(
    now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  );
  return new Date(lastInteractionAt) < staleBefore;
}

function upsertGroup(
  groups: Map<string, ContactGroup>,
  group: Omit<ContactGroup, "contacts">,
): ContactGroup {
  const existing = groups.get(group.key);
  if (existing) return existing;
  const created = { ...group, contacts: [] };
  groups.set(group.key, created);
  return created;
}
