import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import type { NewsletterStatus } from "@prisma/client";
import type { UserLabel } from "@/hooks/useLabels";
import { EmailLabel } from "@/providers/EmailProvider";

export type Row = {
  name: string;
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
  mutate: () => Promise<any>;
  selected: boolean;
  onSelectRow: () => void;
  onDoubleClick: () => void;
  hasUnsubscribeAccess: boolean;
  refetchPremium: () => Promise<any>;
  openPremiumModal: () => void;
  checked: boolean;
  onToggleSelect: (id: string) => void;
}
