"use client";

import { useEffect, useState } from "react";
import { Apple, Download, Monitor } from "lucide-react";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Button } from "@/components/new-landing/common/Button";
import { Paragraph } from "@/components/new-landing/common/Typography";
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
  os: "other",
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

/** Used by the marketing `/desktop` page cloned into this Next app at build time. */
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
        <div className="flex justify-center">
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
        </div>
      </BlurFade>

      <BlurFade duration={0.4} delay={0.4}>
        <div className="mt-4 text-center">
          <Paragraph color="light" size="sm">
            <a href={allDownloadsHref} className="underline underline-offset-2">
              Other downloads
            </a>
          </Paragraph>
        </div>
      </BlurFade>
    </>
  );
}
