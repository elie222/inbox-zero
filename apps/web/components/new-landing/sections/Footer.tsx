import Link from "next/link";
import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { env } from "@/env";
import { Logo } from "@/components/new-landing/common/Logo";
import { cn } from "@/utils";
import { FooterLineLogo } from "@/components/new-landing/FooterLineLogo";
import { Paragraph } from "@/components/new-landing/common/Typography";
import { UnicornScene } from "@/components/new-landing/UnicornScene";
import { footerNavigation } from "@/app/(landing)/home/Footer";
import { BRAND_LOGO_URL } from "@/utils/branding";
import { LanguageSwitcher } from "@/components/new-landing/LanguageSwitcher";
import { LandingLink } from "@/components/new-landing/LandingLink";

interface FooterProps {
  className: string;
  variant?: "default" | "simple";
}

export function Footer({ className, variant = "default" }: FooterProps) {
  const { t } = useLingui();

  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    // Simple footer for self-hosted deployments
    const selfHostedFooter = {
      resources: [
        {
          name: t`Documentation`,
          href: "https://docs.getinboxzero.com",
          target: "_blank",
        },
        {
          name: t`Contact us`,
          href: `mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`,
        },
        { name: "GitHub", href: "/github", target: "_blank" },
        { name: "Discord", href: "/discord", target: "_blank" },
      ],
      legal: [
        { name: t`Terms`, href: "/terms" },
        { name: t`Privacy`, href: "/privacy" },
      ],
    };

    return (
      <footer className="border-t border-[#E7E7E7A3] bg-cover bg-center bg-no-repeat overflow-hidden">
        <div className={cn("overflow-hidden px-6 py-12 lg:px-8", className)}>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {selfHostedFooter.resources.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                target={item.target}
                rel={
                  item.target === "_blank" ? "noopener noreferrer" : undefined
                }
                prefetch={false}
                className="text-sm leading-6 text-gray-500 hover:text-gray-900"
              >
                {item.name}
              </Link>
            ))}
            <span className="text-gray-300">|</span>
            {selfHostedFooter.legal.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="text-sm leading-6 text-gray-500 hover:text-gray-900"
              >
                {item.name}
              </Link>
            ))}
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-gray-500">
            <Trans>
              Powered by{" "}
              <Link
                href="https://getinboxzero.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900"
              >
                Inbox Zero
              </Link>
            </Trans>
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer
      className={cn(
        "border-t border-[#E7E7E7A3] bg-cover bg-center bg-no-repeat overflow-hidden",
        variant === "default" && "relative z-50",
      )}
    >
      {variant === "default" ? <UnicornScene className="opacity-15" /> : null}
      <div
        className={cn("overflow-hidden px-6 py-20 sm:py-24 lg:px-8", className)}
      >
        <nav aria-label="Footer">
          <div className="mt-16 grid grid-cols-2 gap-8 lg:grid-cols-5 xl:col-span-2 xl:mt-0">
            <div>
              <FooterList title={t`Product`} items={footerNavigation.main} />
            </div>
            <div>
              <FooterList
                title={t`Use Cases`}
                items={footerNavigation.useCases}
              />
              <div className="mt-6">
                <FooterList
                  title={t`Industries`}
                  items={footerNavigation.industries}
                />
              </div>
            </div>
            <div>
              <FooterList title={t`Support`} items={footerNavigation.support} />
              <div className="mt-6">
                <FooterList
                  title={t`Free Tools`}
                  items={footerNavigation.tools}
                />
              </div>
            </div>
            <div>
              <FooterList title={t`Company`} items={footerNavigation.company} />
            </div>
            <div>
              <FooterList title={t`Legal`} items={footerNavigation.legal} />
              <div className="mt-6">
                <FooterList
                  title={t`Compare`}
                  items={footerNavigation.compare}
                />
              </div>
            </div>
          </div>
        </nav>
        <div className="mt-40 flex flex-wrap items-center justify-between gap-6">
          <Logo />
          <LanguageSwitcher />
          <div className="flex items-center gap-4">
            {footerNavigation.social.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">{item.name}</span>
                <item.icon className="h-6 w-6" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      </div>
      {variant === "default" && !BRAND_LOGO_URL ? (
        <FooterLineLogo className="hidden xl:block absolute bottom-0 left-1/2 -translate-x-1/2 mx-auto px-6 lg:px-8 -z-10" />
      ) : null}
    </footer>
  );
}

function FooterList(props: {
  title: string;
  items: { name: MessageDescriptor; href: string; target?: string }[];
}) {
  const { i18n } = useLingui();

  return (
    <>
      <Paragraph
        color="gray-900"
        size="sm"
        className="font-semibold leading-6"
        as="h3"
      >
        {props.title}
      </Paragraph>
      <ul className="mt-6 space-y-3">
        {props.items.map((item) => (
          <li key={item.href}>
            <LandingLink
              href={item.href}
              target={item.target}
              prefetch={false}
              className="text-sm leading-6 text-gray-500 hover:text-gray-900"
            >
              {i18n._(item.name)}
            </LandingLink>
          </li>
        ))}
      </ul>
    </>
  );
}
