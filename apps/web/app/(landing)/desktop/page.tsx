import type { Metadata } from "next";
import Link from "next/link";
import {
  Apple,
  ArrowRight,
  Download,
  Monitor,
  RefreshCw,
  Shield,
} from "lucide-react";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { FeatureCardGrid } from "@/app/(marketing)/(landing)/components/FeatureCardGrid";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { BlurFade } from "@/components/new-landing/common/BlurFade";
import { Button } from "@/components/new-landing/common/Button";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import { Heading, Paragraph } from "@/components/new-landing/common/Typography";
import { Gmail } from "@/components/new-landing/icons/Gmail";
import { Outlook } from "@/components/new-landing/icons/Outlook";
import {
  DESKTOP_GITHUB_REPO,
  pickLatestDesktopRelease,
  type DesktopDownloadLinks,
} from "@/utils/desktop/github-release";

export const metadata: Metadata = {
  title: "Inbox Zero Desktop App for Mac and Windows | AI Email Assistant",
  description:
    "Install Inbox Zero on your Mac or Windows PC. The desktop app is a native window around the same AI email assistant you use on the web.",
  alternates: { canonical: "/desktop" },
};

const GITHUB_RELEASES_URL = `https://github.com/${DESKTOP_GITHUB_REPO}/releases`;

export default async function DesktopPage() {
  const downloads = await loadDesktopDownloads();

  return (
    <BasicLayout>
      <DesktopHero downloads={downloads} />
      <DesktopFeatures />
      <FinalCTA />
    </BasicLayout>
  );
}

async function loadDesktopDownloads(): Promise<DesktopDownloadLinks | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${DESKTOP_GITHUB_REPO}/releases?per_page=30`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) return null;
    return pickLatestDesktopRelease(await response.json());
  } catch {
    return null;
  }
}

function DesktopHero({
  downloads,
}: {
  downloads: DesktopDownloadLinks | null;
}) {
  const macUrl = downloads?.macArm64Dmg ?? downloads?.macX64Dmg;
  const intelUrl = downloads?.macX64Dmg;
  const winUrl = downloads?.winX64Exe ?? downloads?.winArm64Exe;

  return (
    <Section className="text-left pt-10 md:pt-20">
      <SectionContent noMarginTop>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="max-w-2xl text-left">
            <BlurFade duration={0.4} delay={0}>
              <div className="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider mb-8">
                <Monitor className="size-3" />
                <span>Desktop app</span>
              </div>
            </BlurFade>

            <BlurFade duration={0.4} delay={0.1}>
              <Heading className="mb-6">
                Inbox Zero,{" "}
                <span className="italic text-blue-500">on your desktop.</span>
              </Heading>
            </BlurFade>

            <BlurFade duration={0.4} delay={0.2}>
              <Paragraph size="lg" className="mb-8 max-w-lg">
                A native Mac and Windows window around the same AI email
                assistant you already use in the browser. Sign in with Google or
                Microsoft in your system browser.
              </Paragraph>
            </BlurFade>

            <BlurFade duration={0.4} delay={0.3}>
              <div className="flex flex-wrap items-center gap-3">
                {macUrl ? (
                  <Button size="lg" asChild>
                    <a href={macUrl}>
                      <span className="relative z-10 flex items-center gap-2">
                        <Apple className="size-4" />
                        Download for Mac
                        {downloads?.version ? ` ${downloads.version}` : ""}
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
                  {intelUrl ? (
                    <>
                      <a
                        href={intelUrl}
                        className="underline underline-offset-2"
                      >
                        Mac Intel
                      </a>
                      {" · "}
                    </>
                  ) : null}
                  {winUrl ? (
                    <>
                      <a href={winUrl} className="underline underline-offset-2">
                        Windows
                      </a>
                      {" · "}
                    </>
                  ) : null}
                  <a
                    href={downloads?.releaseUrl ?? GITHUB_RELEASES_URL}
                    className="underline underline-offset-2"
                  >
                    All downloads
                  </a>
                </Paragraph>
              </div>
            </BlurFade>
          </div>

          <BlurFade duration={0.5} delay={0.2}>
            <div className="relative hidden lg:block">
              <DesktopWindowMockup />
            </div>
          </BlurFade>
        </div>

        <div className="mt-8 lg:mt-16">
          <BrandScroller />
        </div>
      </SectionContent>
    </Section>
  );
}

function DesktopWindowMockup() {
  return (
    <div className="relative max-w-lg mx-auto">
      <div className="absolute inset-0 bg-gray-100 rounded-3xl transform rotate-2" />
      <div className="absolute inset-0 bg-blue-50/50 rounded-3xl transform -rotate-1" />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <div className="ml-3 text-xs text-gray-500">Inbox Zero</div>
        </div>
        <div className="p-5 space-y-3 min-h-[280px] bg-gray-50">
          <div className="rounded-xl bg-white border border-gray-100 p-3 text-sm text-gray-900">
            What needs a reply before lunch?
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-gray-900">
            2 emails need a reply: Sarah on the Q3 budget, and Mike on the API
            docs. I can draft both.
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-3 text-sm text-gray-900">
            Draft the reply to Sarah.
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopFeatures() {
  return (
    <FeatureCardGrid
      heading="The web app, as a desktop window"
      subtitle="Same assistant, same inbox, fewer browser tabs."
      items={[
        {
          icon: <Monitor className="size-5" />,
          title: "Stays out of the browser",
          description:
            "Launch Inbox Zero from your dock or taskbar instead of hunting through tabs.",
        },
        {
          icon: <Shield className="size-5" />,
          title: "Sign in with your browser",
          description:
            "Google and Microsoft login complete in your system browser, then return to the app.",
        },
        {
          icon: <RefreshCw className="size-5" />,
          title: "Updates itself",
          description:
            "New desktop versions download in the background. Restart when you are ready.",
        },
      ]}
    />
  );
}
