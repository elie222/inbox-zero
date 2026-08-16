"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Apple, ArrowRight, Download, Monitor } from "lucide-react";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Button } from "@/components/new-landing/common/Button";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import {
  DESKTOP_GITHUB_REPO,
  detectDesktopClientPlatform,
  getDesktopDownloadCtas,
  type DesktopClientPlatform,
  type DesktopDownloadLinks,
} from "@/utils/desktop/github-release";

const GITHUB_RELEASES_URL = `https://github.com/${DESKTOP_GITHUB_REPO}/releases`;
const DEFAULT_PLATFORM: DesktopClientPlatform = {
  arch: "unknown",
  os: "mac",
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{
      architecture?: string;
      platform?: string;
    }>;
    platform?: string;
  };
};

export function DesktopDownloadCta({
  downloads,
}: {
  downloads: DesktopDownloadLinks | null;
}) {
  const [platform, setPlatform] =
    useState<DesktopClientPlatform>(DEFAULT_PLATFORM);

  useEffect(() => {
    const browser = navigator as NavigatorWithUserAgentData;
    const userAgentData = browser.userAgentData;

    if (!userAgentData?.getHighEntropyValues) {
      setPlatform(
        detectDesktopClientPlatform(browser.userAgent, userAgentData),
      );
      return;
    }

    userAgentData
      .getHighEntropyValues(["architecture", "platform"])
      .then((hints) => {
        setPlatform(detectDesktopClientPlatform(browser.userAgent, hints));
      })
      .catch(() => {
        setPlatform(
          detectDesktopClientPlatform(browser.userAgent, userAgentData),
        );
      });
  }, []);

  const ctas = downloads
    ? getDesktopDownloadCtas(downloads, platform)
    : { alternatives: [], primary: null };
  const allDownloadsHref = downloads?.releaseUrl ?? GITHUB_RELEASES_URL;

  return (
    <>
      <BlurFade duration={0.4} delay={0.3}>
        <div className="flex flex-wrap items-center gap-3">
          {ctas.primary ? (
            <Button size="lg" asChild>
              <a href={ctas.primary.href}>
                <span className="relative z-10 flex items-center gap-2">
                  {ctas.primary.kind === "mac" ? (
                    <Apple className="size-4" />
                  ) : (
                    <Monitor className="size-4" />
                  )}
                  {ctas.primary.label}
                </span>
              </a>
            </Button>
          ) : (
            <Button size="lg" asChild>
              <a href={GITHUB_RELEASES_URL}>
                <span className="relative z-10 flex items-center gap-2">
                  <Download className="size-4" />
                  View desktop releases
                </span>
              </a>
            </Button>
          )}
          <Button variant="secondary-two" size="lg" asChild>
            <Link href="/login">
              <span className="flex items-center gap-2">
                Get started on web
                <ArrowRight className="size-4" />
              </span>
            </Link>
          </Button>
        </div>
      </BlurFade>

      <BlurFade duration={0.4} delay={0.4}>
        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-2">
            <Paragraph color="light" size="sm">
              Works with
            </Paragraph>
            <Outlook />
            <Gmail />
          </div>
          <Paragraph color="light" size="sm">
            {ctas.alternatives.map((item, index) => (
              <span key={item.href}>
                {index > 0 ? " · " : null}
                <a href={item.href} className="underline underline-offset-2">
                  {item.shortLabel}
                </a>
              </span>
            ))}
            {ctas.alternatives.length > 0 ? " · " : null}
            <a href={allDownloadsHref} className="underline underline-offset-2">
              All downloads
            </a>
          </Paragraph>
        </div>
      </BlurFade>
    </>
  );
}
