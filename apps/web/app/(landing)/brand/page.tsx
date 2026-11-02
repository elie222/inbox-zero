import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CopyButton } from "@/app/(landing)/brand/CopyButton";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Footer } from "@/app/(landing)/home/Footer";
import { Logo } from "@/components/Logo";
import { BlogHeader } from "@/components/layouts/BlogLayout";
import { Button } from "@/components/new-landing/common/Button";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";
import { env } from "@/env";
import { cn } from "@/utils";
import { getBrandTitle, HAS_BRAND_KIT } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Brand Kit"),
  description:
    "Logos, colors, and guidelines for presenting the Inbox Zero brand consistently.",
  alternates: { canonical: "/brand" },
};

const BOILERPLATE =
  "Inbox Zero is an open source AI email assistant and Superhuman alternative. It organizes your inbox, drafts replies in your voice, and helps you reach inbox zero fast, with a full email client for Gmail and Outlook.";

const SCREENSHOT_SRC = "/images/new-landing/inbox-zero-mail.webp";

const logos: {
  name: string;
  theme: "dark" | "light";
  preview: React.ReactNode;
  downloads: { label: string; href: string }[];
}[] = [
  {
    name: "Wordmark on dark",
    theme: "dark",
    preview: <Logo className="h-7 w-auto text-white" />,
    downloads: [
      { label: ".svg", href: "/brand/inbox-zero-wordmark-light.svg" },
      { label: ".png", href: "/brand/inbox-zero-wordmark-light.png" },
    ],
  },
  {
    name: "Wordmark on light",
    theme: "light",
    preview: <Logo className="h-7 w-auto text-gray-900" />,
    downloads: [
      { label: ".svg", href: "/brand/inbox-zero-wordmark-dark.svg" },
      { label: ".png", href: "/brand/inbox-zero-wordmark-dark.png" },
    ],
  },
  {
    name: "App icon on dark",
    theme: "dark",
    preview: <AppIcon size={88} />,
    downloads: [{ label: ".png", href: "/brand/inbox-zero-icon.png" }],
  },
  {
    name: "App icon on light",
    theme: "light",
    preview: <AppIcon size={88} />,
    downloads: [{ label: ".png", href: "/brand/inbox-zero-icon.png" }],
  },
];

const colors = [
  { name: "Sky Blue", hex: "#67B0F2" },
  { name: "Inbox Blue", hex: "#3478F6" },
  { name: "Ink", hex: "#111827" },
  { name: "White", hex: "#FFFFFF" },
];

export default function BrandPage() {
  if (!HAS_BRAND_KIT) notFound();

  return (
    <>
      <BlogHeader />

      <div className="mx-auto max-w-4xl px-6 pb-24">
        <div className="flex flex-col items-center pt-20 text-center">
          <AppIcon size={112} />
          <div className="mt-6">
            <PageHeading>Brand Kit</PageHeading>
          </div>
          <Paragraph className="mt-4" size="lg">
            Guidelines and assets for presenting the Inbox Zero brand
            consistently.
          </Paragraph>
          <div className="mt-8">
            <Button size="lg" asChild>
              <a href="/brand/inbox-zero-brand-assets.zip" download>
                Download all assets
              </a>
            </Button>
          </div>
        </div>

        <BrandSection title="Naming">
          <BrandText>
            “Inbox Zero” is the brand name. It is always two words, each
            starting with a capital letter.
          </BrandText>
          <BrandText>
            It should not be written as “InboxZero”, “Inbox-Zero”, “inbox zero”,
            or any other variation.
          </BrandText>
        </BrandSection>

        <BrandSection title="Logo">
          <BrandText>
            Use the wordmark wherever there is room for it, and the app icon
            where space is tight. Do not alter these files in any way.
          </BrandText>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {logos.map((logo) => (
              <div
                key={logo.name}
                className={cn(
                  "group relative flex h-48 items-center justify-center rounded-2xl border",
                  logo.theme === "dark"
                    ? "border-gray-800 bg-gray-950"
                    : "border-gray-200 bg-gray-50",
                )}
              >
                <span className="sr-only">{logo.name}</span>
                {logo.preview}
                <div className="absolute right-3 bottom-3 flex gap-2 transition-opacity [@media(hover:hover)]:opacity-0 group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                  {logo.downloads.map((download) => (
                    <a
                      key={download.label}
                      href={download.href}
                      download
                      aria-label={`Download ${logo.name} as ${download.label}`}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-xs",
                        logo.theme === "dark"
                          ? "bg-white/10 text-white hover:bg-white/20"
                          : "bg-gray-900/5 text-gray-700 hover:bg-gray-900/10",
                      )}
                    >
                      <DownloadIcon className="size-3" />
                      {download.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </BrandSection>

        <BrandSection title="Colors">
          <BrandText>
            Our blues come from the app icon gradient. Pair them with Ink and
            White.
          </BrandText>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {colors.map((color) => (
              <div key={color.hex}>
                <div
                  className="h-24 rounded-2xl border border-gray-200"
                  style={{ backgroundColor: color.hex }}
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {color.name}
                    </div>
                    <div className="font-mono text-gray-500 text-xs">
                      {color.hex}
                    </div>
                  </div>
                  <CopyButton
                    value={color.hex}
                    label={`Copy ${color.name} hex`}
                    iconOnly
                  />
                </div>
              </div>
            ))}
          </div>
        </BrandSection>

        <BrandSection title="Screenshots">
          <BrandText>
            Use this product screenshot when presenting Inbox Zero. It uses demo
            data, so no real inbox is shown.
          </BrandText>
          <a
            href={SCREENSHOT_SRC}
            download="inbox-zero-screenshot.webp"
            className="mt-6 block overflow-hidden rounded-2xl border border-gray-200"
          >
            <Image
              src={SCREENSHOT_SRC}
              alt="Inbox Zero Mail on desktop and mobile"
              width={2540}
              height={1520}
              className="h-auto w-full"
            />
          </a>
        </BrandSection>

        <BrandSection title="Description">
          <BrandText>Use this description when writing about us.</BrandText>
          <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-gray-200 p-6">
            <Paragraph color="dark">{BOILERPLATE}</Paragraph>
            <CopyButton value={BOILERPLATE} label="Copy text" />
          </div>
        </BrandSection>

        <BrandSection title="Questions">
          <BrandText>
            Please{" "}
            <a
              href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
              className="font-medium text-gray-900 underline underline-offset-4"
            >
              contact us
            </a>{" "}
            if you need additional assets or have questions about using the
            Inbox Zero brand.
          </BrandText>
        </BrandSection>
      </div>

      <FinalCTA />
      <Footer />
    </>
  );
}

function BrandSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-20">
      <h2 className="font-title text-2xl text-gray-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BrandText({ children }: { children: React.ReactNode }) {
  return (
    <Paragraph color="gray-500" className="mt-2 first:mt-0">
      {children}
    </Paragraph>
  );
}

function AppIcon({ size }: { size: number }) {
  return (
    <Image
      src="/brand/inbox-zero-icon.png"
      alt="Inbox Zero app icon"
      width={size}
      height={size}
    />
  );
}
