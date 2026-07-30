import type { ReactNode } from "react";
import { ItemCard } from "@/components/ui/item";
import { cn } from "@/utils";

/**
 * A bordered card of `Item` rows separated by rules, for lists where each row
 * is a record rather than a standalone card.
 *
 * `divide-border` is explicit because `Item` sets `border-transparent`; the
 * divide selector outranks it, but a bare `divide-y` would inherit the
 * transparent colour and render nothing.
 */
export function ListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ItemCard
      className={cn(
        "divide-y divide-border overflow-hidden [&>[data-slot=item]]:rounded-none",
        className,
      )}
    >
      {children}
    </ItemCard>
  );
}
