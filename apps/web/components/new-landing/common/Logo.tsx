"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { CopyIcon, ExternalLinkIcon, PaletteIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Logo as Wordmark } from "@/components/Logo";
import { LandingLink } from "@/components/new-landing/LandingLink";
import { localizeLandingHref } from "@/utils/i18n/landing";
import { toLocale } from "@/utils/i18n/locales";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/utils";
import { HAS_BRAND_KIT } from "@/utils/branding";

interface LogoProps {
  variant?: "default" | "mobile";
}

export function Logo({ variant = "default" }: LogoProps) {
  const router = useRouter();
  const { t, i18n } = useLingui();
  const sizeClass = variant === "mobile" ? "h-4 w-auto" : "h-5 w-auto";

  const link = (
    <LandingLink href="/">
      <Wordmark className={cn(sizeClass, "text-gray-900")} />
    </LandingLink>
  );

  if (!HAS_BRAND_KIT) return link;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{link}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onSelect={() =>
            window.open(
              localizeLandingHref("/", toLocale(i18n.locale)),
              "_blank",
            )
          }
        >
          <ExternalLinkIcon className="mr-2 size-4" />
          <Trans>Open Link in New Tab</Trans>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={async () => {
            if (await copyLogoSvg()) {
              toastSuccess({ description: t`Logo copied as SVG` });
            } else {
              toastError({ description: t`Couldn't copy the logo` });
            }
          }}
        >
          <CopyIcon className="mr-2 size-4" />
          <Trans>Copy Logo as SVG</Trans>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => router.push("/brand")}>
          <PaletteIcon className="mr-2 size-4" />
          <Trans>Go to Brand Kit</Trans>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

async function copyLogoSvg(): Promise<boolean> {
  try {
    // Passing a promise keeps the user gesture alive in Safari while the SVG loads.
    const svg = fetch("/brand/inbox-zero-wordmark-dark.svg")
      .then((res) => {
        if (!res.ok) throw new Error(`Logo request failed: ${res.status}`);
        return res.text();
      })
      .then((text) => new Blob([text], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": svg })]);
    return true;
  } catch {
    return false;
  }
}
