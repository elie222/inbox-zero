import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import type { NewsletterStatus } from "@/generated/prisma/enums";
import type { EmailLabel } from "@/providers/EmailProvider";
import type { UserResponse } from "@/app/api/user/me/route";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";

export type Row = {
  name: string;
  fromName?: string;
  unsubscribeLink?: string | null;
  status?: NewsletterStatus | null;
  autoArchived?: { id?: string | null };
};

type Newsletter = NewsletterStatsResponse["newsletters"][number];

export interface RowProps {
  emailAccountId: string;
  userEmail: string;
  item: Newsletter;
  readPercentage: number;
  archivedEmails: number;
  archivedPercentage: number;

  onOpenNewsletter: (row: Newsletter) => void;
  labels: EmailLabel[];
  // biome-ignore lint/suspicious/noExplicitAny: simplest
  mutate: () => Promise<any>;
  selected: boolean;
  onSelectRow: () => void;
  onDoubleClick: () => void;
  hasUnsubscribeAccess: boolean;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  openPremiumModal: () => void;
  checked: boolean;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  filter: NewsletterFilterType;
}
