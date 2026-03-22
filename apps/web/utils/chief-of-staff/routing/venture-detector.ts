import { Venture } from "../types";

interface VentureInput {
  clientGroupVenture: Venture | null;
  inboxEmail: string;
  senderEmail: string;
}

const INBOX_TO_VENTURE: Record<string, Venture> = {
  "nick@smartcollege.com": Venture.SMART_COLLEGE,
  "nick@growwithpraxis.com": Venture.PRAXIS,
};

const DOMAIN_TO_VENTURE: Record<string, Venture> = {
  "smartcollege.com": Venture.SMART_COLLEGE,
  "growwithpraxis.com": Venture.PRAXIS,
};

export function detectVenture(input: VentureInput): Venture {
  // 1. Check inbox
  const inboxVenture = INBOX_TO_VENTURE[input.inboxEmail.toLowerCase()];
  if (inboxVenture) return inboxVenture;
  // 2. Check sender domain
  const senderDomain = input.senderEmail.toLowerCase().split("@")[1];
  if (senderDomain) {
    const domainVenture = DOMAIN_TO_VENTURE[senderDomain];
    if (domainVenture) return domainVenture;
  }
  // 3. Client group association
  if (input.clientGroupVenture) return input.clientGroupVenture;
  // 4. Default
  return Venture.PERSONAL;
}
