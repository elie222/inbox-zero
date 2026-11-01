"use client";

import { usePremiumSidebarCard } from "@/components/PremiumCard";
import {
  type SidebarCard,
  SidebarCardStack,
} from "@/components/sidebar-cards/SidebarCardStack";
import { useSignatureSidebarCard } from "@/components/sidebar-cards/useSignatureSidebarCard";

// Ordered by urgency: a billing problem comes before a suggestion.
export function SidebarCards({
  collapsed,
  includePremium = true,
  className,
}: {
  collapsed: boolean;
  includePremium?: boolean;
  className?: string;
}) {
  const premium = usePremiumSidebarCard();
  const signatures = useSignatureSidebarCard();
  const cards = [includePremium ? premium : null, signatures.card].filter(
    (card): card is SidebarCard => card !== null,
  );

  return (
    <>
      <SidebarCardStack
        cards={cards}
        className={className}
        collapsed={collapsed}
      />
      {signatures.dialog}
    </>
  );
}
