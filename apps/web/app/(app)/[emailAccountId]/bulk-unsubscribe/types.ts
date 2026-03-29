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
  checked: boolean;
  emailAccountId: string;
  filter: NewsletterFilterType;
  hasUnsubscribeAccess: boolean;
  item: Newsletter;
  labels: EmailLabel[];
  // biome-ignore lint/suspicious/noExplicitAny: simplest
  mutate: () => Promise<any>;
  onDoubleClick: () => void;

  onOpenNewsletter: (row: Newsletter) => void;
  onSelectRow: () => void;
  onToggleSelect: (id: string, shiftKey?: boolean) => void;
  openPremiumModal: () => void;
  readPercentage: number;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  selected: boolean;
  userEmail: string;
}
