"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export function SharedEmptyState() {
  const { emailAccountId } = useAccount();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <SharedThreadIllustration />
        </EmptyMedia>
        <EmptyTitle>No discussions yet</EmptyTitle>
        <EmptyDescription>
          Discuss an email privately by @mentioning a teammate in a comment.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline" size="sm">
          <Link href={prefixPath(emailAccountId, "/mail")}>Go to inbox</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function SharedThreadIllustration() {
  return (
    <svg
      width="192"
      height="128"
      viewBox="0 0 192 128"
      fill="none"
      aria-hidden="true"
      className="text-muted-foreground"
    >
      <rect
        x="24"
        y="16"
        width="112"
        height="80"
        rx="8"
        className="fill-muted stroke-border"
      />
      <circle cx="42" cy="34" r="8" className="fill-border" />
      <rect x="56" y="29" width="48" height="5" rx="2.5" fill="currentColor" />
      <rect
        x="56"
        y="37"
        width="32"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="36"
        y="54"
        width="88"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.35"
      />
      <rect
        x="36"
        y="64"
        width="76"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.35"
      />
      <rect
        x="36"
        y="74"
        width="60"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M112 60h68a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6h-48l-10 10v-10h-10a6 6 0 0 1-6-6V66a6 6 0 0 1 6-6Z"
        className="fill-background stroke-blue-500 dark:stroke-blue-400"
        strokeWidth="1.5"
      />
      <circle
        cx="125"
        cy="75"
        r="5"
        className="fill-blue-500 dark:fill-blue-400"
      />
      <rect
        x="135"
        y="71"
        width="36"
        height="8"
        rx="4"
        className="fill-blue-100 dark:fill-blue-500/30"
      />
      <rect
        x="120"
        y="87"
        width="52"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  );
}
