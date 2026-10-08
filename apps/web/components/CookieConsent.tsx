"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  useCookieBannerOpen,
  useCookieConsent,
} from "@/hooks/useCookieConsent";
import { BRAND_NAME } from "@/utils/branding";
import { reopenCookieConsent, setCookieConsent } from "@/utils/cookie-consent";

export function CookieConsentBanner() {
  const open = useCookieBannerOpen();
  if (!open) return null;

  return (
    <section
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:left-4 sm:bottom-4 sm:max-w-sm"
    >
      <div className="rounded-xl border bg-background p-4 shadow-lg">
        <p className="text-sm font-medium text-foreground">
          We value your privacy
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          We use cookies to understand how people use {BRAND_NAME} and to
          measure our marketing. You can change your choice at any time.{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Privacy policy
          </Link>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="primaryBlack"
            size="sm"
            onClick={() => setCookieConsent("denied")}
          >
            Reject
          </Button>
          <Button
            variant="primaryBlack"
            size="sm"
            onClick={() => setCookieConsent("granted")}
          >
            Accept
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Renders tracking scripts only once the visitor's consent allows them. */
export function WithCookieConsent({ children }: { children: React.ReactNode }) {
  const consent = useCookieConsent();
  if (consent !== "not-required" && consent !== "granted") return null;

  return children;
}

export function CookieSettingsButton({ className }: { className?: string }) {
  const consent = useCookieConsent();
  if (consent !== "granted" && consent !== "denied") return null;

  return (
    <button type="button" className={className} onClick={reopenCookieConsent}>
      Cookie settings
    </button>
  );
}
