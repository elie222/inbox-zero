// apps/web/utils/chief-of-staff/vip/client-grouper.ts

interface ClientInfo {
  email: string;
  name: string;
}

export function shouldAutoGroup(a: ClientInfo, b: ClientInfo): boolean {
  const domainA = a.email.toLowerCase().split("@")[1];
  const domainB = b.email.toLowerCase().split("@")[1];
  if (!domainA || !domainB || domainA !== domainB) return false;
  const lastNameA = extractLastName(a.name);
  const lastNameB = extractLastName(b.name);
  if (!lastNameA || !lastNameB) return false;
  return lastNameA.toLowerCase() === lastNameB.toLowerCase();
}

function extractLastName(fullName: string): string | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}
