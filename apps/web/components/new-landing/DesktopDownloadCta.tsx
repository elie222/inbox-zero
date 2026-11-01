"use client";

import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone } from "lucide-react";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Button } from "@/components/new-landing/common/Button";
import { scrollToSection } from "@/components/new-landing/common/SectionLink";
import { Apple } from "@/components/new-landing/icons/Apple";
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

/** Used by the marketing `/download` page cloned into this Next app at build time. */
export function DesktopDownloadCta({
  downloads,
  buttonSize = "lg",
}: {
  buttonSize?: "lg" | "xl";
  downloads: DesktopDownloadLinks | null;
}) {
  const [platform, setPlatform] =
    useState<DesktopClientPlatform>(DEFAULT_PLATFORM);
  const [mobileStore, setMobileStore] = useState<MobileStore | null>(null);

  useEffect(() => {
    const browser = navigator as NavigatorWithUserAgentData;
    const userAgentData = browser.userAgentData;

    setMobileStore(detectMobileStore(browser.userAgent));

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

  return (
    <BlurFade duration={0.4} delay={0.3}>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {mobileStore ? (
          <Button size={buttonSize} asChild>
            <a href={mobileStore.href}>
              <span className="relative z-10 flex items-center gap-2">
                <Smartphone className="size-4" />
                {mobileStore.label}
              </span>
            </a>
          </Button>
        ) : ctas.primary ? (
          <Button size={buttonSize} asChild>
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
          <Button size={buttonSize} asChild>
            <a href={GITHUB_RELEASES_URL}>
              <span className="relative z-10 flex items-center gap-2">
                <Download className="size-4" />
                View desktop releases
              </span>
            </a>
          </Button>
        )}
        <Button variant="secondary-two" size={buttonSize} asChild>
          <button type="button" onClick={() => scrollToSection("downloads")}>
            Other platforms
          </button>
        </Button>
      </div>
    </BlurFade>
  );
}

type MobileStore = { href: string; label: string };

function detectMobileStore(userAgent: string): MobileStore | null {
  if (/iPhone|iPod/.test(userAgent)) {
    return { href: "/ios", label: "Download on the App Store" };
  }
  if (/Android/.test(userAgent)) {
    return { href: "/android", label: "Get it on Google Play" };
  }
  return null;
}
