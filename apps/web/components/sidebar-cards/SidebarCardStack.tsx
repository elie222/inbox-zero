"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/utils";

export type SidebarCard = {
  id: string;
  content: ReactNode;
  collapsedContent?: ReactNode;
};

const MAX_PEEKING_CARDS = 2;
const PEEK_OFFSET_PX = 6;

// Shows the first card, with the rest peeking out beneath it so several never
// fill the sidebar. Hovering or tabbing into the stack lays them all out.
export function SidebarCardStack({
  cards,
  collapsed,
  className,
}: {
  cards: SidebarCard[];
  collapsed: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [top, ...rest] = cards;
  if (collapsed && expanded) setExpanded(false);
  if (!top) return null;

  if (collapsed) {
    if (!top.collapsedContent) return null;
    return (
      <div className={cn("relative flex justify-center", className)}>
        {top.collapsedContent}
        {rest.length > 0 && (
          <span className="pointer-events-none absolute -top-1 right-1/2 flex size-4 translate-x-5 items-center justify-center rounded-full bg-foreground font-medium text-[10px] text-background">
            {cards.length}
          </span>
        )}
      </div>
    );
  }

  const peeking = rest.slice(0, MAX_PEEKING_CARDS);
  const isExpanded = expanded && rest.length > 0;

  return (
    <section
      aria-label="Notices"
      className={className}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setExpanded(false);
      }}
    >
      {/* The top card keeps its place in the tree so expanding never remounts it and drops focus. */}
      <div
        className="relative"
        style={{
          marginBottom: isExpanded ? 0 : peeking.length * PEEK_OFFSET_PX,
        }}
      >
        {!isExpanded &&
          peeking.map((card, index) => (
            <div
              aria-hidden
              className="absolute inset-0 origin-bottom rounded-lg border bg-card shadow-sm"
              key={card.id}
              style={{
                transform: `translateY(${(index + 1) * PEEK_OFFSET_PX}px) scale(${1 - (index + 1) * 0.06})`,
                zIndex: peeking.length - index,
              }}
            />
          ))}
        <div className="relative" style={{ zIndex: peeking.length + 1 }}>
          {top.content}
        </div>
      </div>
      {isExpanded &&
        rest.map((card) => (
          <div className="mt-2" key={card.id}>
            {card.content}
          </div>
        ))}
    </section>
  );
}
