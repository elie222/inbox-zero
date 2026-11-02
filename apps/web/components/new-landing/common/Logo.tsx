"use client";

import { CopyIcon, ExternalLinkIcon, PaletteIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo as Wordmark } from "@/components/Logo";
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
  const sizeClass = variant === "mobile" ? "h-4 w-auto" : "h-5 w-auto";

  const link = (
    <Link href="/">
      <Wordmark className={cn(sizeClass, "text-gray-900")} />
    </Link>
  );

  if (!HAS_BRAND_KIT) return link;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{link}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => window.open("/", "_blank")}>
          <ExternalLinkIcon className="mr-2 size-4" />
          Open Link in New Tab
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={copyLogoSvg}>
          <CopyIcon className="mr-2 size-4" />
          Copy Logo as SVG
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => router.push("/brand")}>
          <PaletteIcon className="mr-2 size-4" />
          Go to Brand Kit
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

async function copyLogoSvg() {
  try {
    // Passing a promise keeps the user gesture alive in Safari while the SVG loads.
    const svg = fetch("/brand/inbox-zero-wordmark-dark.svg")
      .then((res) => {
        if (!res.ok) throw new Error(`Logo request failed: ${res.status}`);
        return res.text();
      })
      .then((text) => new Blob([text], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": svg })]);
    toastSuccess({ description: "Logo copied as SVG" });
  } catch {
    toastError({ description: "Couldn't copy the logo" });
  }
}
