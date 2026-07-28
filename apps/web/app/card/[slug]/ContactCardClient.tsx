"use client";

import {
  BuildingIcon,
  DownloadIcon,
  GlobeIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { PublicContactCard } from "@/utils/contact-card/public";

export function ContactCardClient({ card }: { card: PublicContactCard }) {
  useViewBeacon(card.slug);

  const role = [card.title, card.companyName].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-4">
          {card.photoUrl ? (
            <Image
              src={card.photoUrl}
              alt=""
              width={72}
              height={72}
              className="size-18 shrink-0 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-18 shrink-0 items-center justify-center rounded-full bg-muted font-display text-2xl">
              {card.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl tracking-tight sm:text-3xl">
              {card.displayName}
            </h1>
            {role && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {role}
              </p>
            )}
          </div>
        </div>

        {card.headline && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {card.headline}
          </p>
        )}

        <div className="mt-6 space-y-1">
          {card.email && (
            <CardLink
              href={`mailto:${card.email}`}
              icon={<MailIcon className="size-4" />}
              label={card.email}
            />
          )}
          {card.phone && (
            <CardLink
              href={`tel:${card.phone.replace(/[^\d+]/g, "")}`}
              icon={<PhoneIcon className="size-4" />}
              label={card.phone}
            />
          )}
          {card.website && (
            <CardLink
              href={card.website}
              icon={<GlobeIcon className="size-4" />}
              label={card.website.replace(/^https?:\/\//, "")}
              external
            />
          )}
          {!card.email && !card.phone && !card.website && card.companyName && (
            <CardLink
              icon={<BuildingIcon className="size-4" />}
              label={card.companyName}
            />
          )}
        </div>

        <Button asChild className="mt-6 w-full" size="lg">
          <a href={`/api/contact-card/${card.slug}/vcard`} download>
            <DownloadIcon className="mr-2 size-4" />
            Save to contacts
          </a>
        </Button>
      </div>
    </main>
  );
}

// Counted client-side so prefetches and metadata generation don't register
// as views. Fire-and-forget: a failed count must never break the page.
function useViewBeacon(slug: string) {
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/contact-card/${slug}/view`, {
      method: "POST",
      signal: controller.signal,
    }).catch(() => {
      // A blocked or offline beacon just means this view goes uncounted
    });
    return () => controller.abort();
  }, [slug]);
}

function CardLink({
  href,
  icon,
  label,
  external,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </>
  );

  if (!href) {
    return (
      <div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
        {content}
      </div>
    );
  }

  return (
    <a
      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
      href={href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : undefined)}
    >
      {content}
    </a>
  );
}
