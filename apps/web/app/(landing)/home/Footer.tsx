import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";
import Link from "next/link";
import { LandingLink } from "@/components/new-landing/LandingLink";
import { env } from "@/env";
import { EXTENSION_URL } from "@/utils/config";
import { BRAND_NAME, HAS_BRAND_KIT } from "@/utils/branding";
import { CookieSettingsButton } from "@/components/CookieConsent";

type FooterLink = { name: MessageDescriptor; href: string; target?: string };

export const footerNavigation = {
  main: [
    {
      name: msg`${BRAND_NAME} Tabs (Chrome Extension)`,
      href: EXTENSION_URL,
      target: "_blank",
    },
    { name: msg`AI Email Assistant`, href: "/ai-email-assistant" },
    { name: msg`Email App`, href: "/email-client" },
    { name: msg`Mobile App`, href: "/mobile-app" },
    { name: msg`Download`, href: "/download" },
    { name: msg`AI Chat for Slack & Telegram`, href: "/ai-assistant-chat" },
    { name: msg`Slack AI Assistant`, href: "/slack-integration" },
    { name: msg`Telegram AI Assistant`, href: "/telegram-integration" },
    { name: msg`Teams AI Assistant`, href: "/teams-integration" },
    { name: msg`Brief My Meeting`, href: "/brief-my-meeting" },
    { name: msg`AI Meeting Notetaker`, href: "/ai-meeting-notetaker" },
    { name: msg`Reply Zero`, href: "/reply-zero-ai" },
    { name: msg`Bulk Email Unsubscriber`, href: "/bulk-email-unsubscriber" },
    { name: msg`Clean your inbox`, href: "/clean-inbox" },
    { name: msg`Cold Email Blocker`, href: "/block-cold-emails" },
    { name: msg`Email Analytics`, href: "/email-analytics" },
    { name: msg`Auto Forward Emails`, href: "/auto-forward-emails" },
    { name: msg`Auto-File Attachments`, href: "/auto-file-email-attachments" },
    { name: msg`Open Source`, href: "/github", target: "_blank" },
  ],
  useCases: [
    { name: msg`Founder`, href: "/founders" },
    { name: msg`Small Business`, href: "/small-business" },
    { name: msg`Content Creator`, href: "/creator" },
    { name: msg`Realtor`, href: "/real-estate" },
    { name: msg`Customer Support`, href: "/customer-support" },
    { name: msg`E-commerce`, href: "/ecommerce" },
  ],
  industries: [
    { name: msg`MSPs`, href: "/msp" },
    { name: msg`Property Management`, href: "/property-management" },
    { name: msg`Law Firms`, href: "/law-firms" },
    { name: msg`Accounting Firms`, href: "/accounting-firms" },
  ],
  compare: [
    {
      name: msg`Best AI Email Assistants`,
      href: "/blog/post/best-ai-email-assistants",
    },
    {
      name: msg`AI Email Assistant Directory`,
      href: "https://aiemailassistants.com",
      target: "_blank",
    },
    { name: msg`vs Fyxer.ai`, href: "/best-fyxer-alternative" },
    { name: msg`vs Superhuman`, href: "/best-superhuman-alternative" },
    { name: msg`vs Shortwave`, href: "/best-shortwave-alternative" },
    {
      name: msg`vs Perplexity Email Assistant`,
      href: "/best-perplexity-email-assistant-alternative",
    },
  ],
  tools: [
    { name: msg`All Free Email Tools`, href: "/tools" },
    {
      name: msg`Email Deliverability Checker`,
      href: "/tools/email-deliverability-checker",
    },
    { name: msg`Gmail Personality Quiz`, href: "/tools/gmail-quiz" },
    { name: msg`Subject Line Analyzer`, href: "/tools/subject-line-analyzer" },
    {
      name: msg`Email Signature Generator`,
      href: "/tools/email-signature-generator",
    },
    {
      name: msg`Meeting Cost Calculator`,
      href: "/tools/meeting-cost-calculator",
    },
    {
      name: msg`Team Email Cost Calculator`,
      href: "/tools/email-cost-calculator",
    },
  ],
  support: [
    { name: msg`Pricing`, href: "/pricing" },
    { name: msg`Support`, href: "/support" },
    { name: msg`Contact us`, href: `mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}` },
    {
      name: msg`Documentation`,
      href: "https://docs.getinboxzero.com",
      target: "_blank",
    },
    {
      name: msg`Feature Requests`,
      href: "/feature-requests",
      target: "_blank",
    },
    { name: msg`Changelog`, href: "/changelog", target: "_blank" },
    {
      name: msg`Status`,
      href: "https://inbox-zero.openstatus.dev/",
      target: "_blank",
    },
    { name: msg`CLI`, href: "/cli" },
    { name: msg`OpenClaw Skill`, href: "/openclaw" },
  ],
  company: [
    { name: msg`About`, href: "/about" },
    { name: msg`Affiliates`, href: "/affiliates", target: "_blank" },
    { name: msg`Blog`, href: "/blog" },
    { name: msg`Case Studies`, href: "/case-studies" },
    { name: msg`Twitter`, href: "/twitter", target: "_blank" },
    { name: msg`GitHub`, href: "/github", target: "_blank" },
    { name: msg`Discord`, href: "/discord", target: "_blank" },
    { name: msg`OSS Friends`, href: "/oss-friends" },
    ...(HAS_BRAND_KIT ? [{ name: msg`Brand Kit`, href: "/brand" }] : []),
    { name: msg`Email Blaster`, href: "/game" },
    {
      name: msg`Bot Directory`,
      href: "https://botdirectory.ai",
      target: "_blank",
    },
    { name: msg`Rakazo`, href: "https://rakazo.com", target: "_blank" },
  ],
  legal: [
    { name: msg`Terms`, href: "/terms" },
    { name: msg`Privacy`, href: "/privacy" },
    {
      name: msg`SOC2 Compliant`,
      href: "https://security.getinboxzero.com",
      target: "_blank",
    },
  ],
  social: [
    {
      name: "Twitter",
      href: "/twitter",
      target: "_blank",
      icon: (props: ComponentProps<"svg">) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <title>Twitter</title>
          <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
        </svg>
      ),
    },
    {
      name: "GitHub",
      href: "/github",
      target: "_blank",
      icon: (props: ComponentProps<"svg">) => (
        <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
          <title>GitHub</title>
          <path
            fillRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            clipRule="evenodd"
          />
        </svg>
      ),
    },
    {
      name: "Discord",
      href: "/discord",
      target: "_blank",
      icon: (props: ComponentProps<"svg">) => (
        <svg fill="currentColor" viewBox="0 0 48 48" {...props}>
          <title>Discord</title>
          <path d="M40,12c0,0-4.585-3.588-10-4l-0.488,0.976C34.408,10.174,36.654,11.891,39,14c-4.045-2.065-8.039-4-15-4s-10.955,1.935-15,4c2.346-2.109,5.018-4.015,9.488-5.024L18,8c-5.681,0.537-10,4-10,4s-5.121,7.425-6,22c5.162,5.953,13,6,13,6l1.639-2.185C13.857,36.848,10.715,35.121,8,32c3.238,2.45,8.125,5,16,5s12.762-2.55,16-5c-2.715,3.121-5.857,4.848-8.639,5.815L33,40c0,0,7.838-0.047,13-6C45.121,19.425,40,12,40,12z M17.5,30c-1.933,0-3.5-1.791-3.5-4c0-2.209,1.567-4,3.5-4s3.5,1.791,3.5,4C21,28.209,19.433,30,17.5,30z M30.5,30c-1.933,0-3.5-1.791-3.5-4c0-2.209,1.567-4,3.5-4s3.5,1.791,3.5,4C34,28.209,32.433,30,30.5,30z" />
        </svg>
      ),
    },
  ],
};

// Simple footer for self-hosted deployments
const selfHostedFooter = {
  resources: [
    {
      name: msg`Documentation`,
      href: "https://docs.getinboxzero.com",
      target: "_blank",
    },
    { name: msg`Contact us`, href: `mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}` },
    { name: msg`GitHub`, href: "/github", target: "_blank" },
    { name: msg`Discord`, href: "/discord", target: "_blank" },
  ],
  legal: [
    { name: msg`Terms`, href: "/terms" },
    { name: msg`Privacy`, href: "/privacy" },
  ],
};

export function Footer() {
  const { t, i18n } = useLingui();
  const year = new Date().getFullYear();
  const copyrightName =
    BRAND_NAME === "Inbox Zero" ? "Inbox Zero Inc." : BRAND_NAME;

  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return (
      <footer className="relative">
        <div className="mx-auto max-w-7xl overflow-hidden px-6 py-12 lg:px-8">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {selfHostedFooter.resources.map((item) => (
              <LandingLink
                key={item.href}
                href={item.href}
                target={item.target}
                rel={
                  item.target === "_blank" ? "noopener noreferrer" : undefined
                }
                className="text-sm leading-6 text-gray-600 hover:text-gray-900"
              >
                {i18n._(item.name)}
              </LandingLink>
            ))}
            <span className="text-gray-300">|</span>
            {selfHostedFooter.legal.map((item) => (
              <LandingLink
                key={item.href}
                href={item.href}
                className="text-sm leading-6 text-gray-600 hover:text-gray-900"
              >
                {i18n._(item.name)}
              </LandingLink>
            ))}
            <CookieSettingsButton className="text-sm leading-6 text-gray-600 hover:text-gray-900" />
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
    <footer className="relative">
      <div className="mx-auto max-w-7xl overflow-hidden px-6 py-20 sm:py-24 lg:px-8">
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

              <div className="mt-6">
                <FooterList
                  title={t`Compare`}
                  items={footerNavigation.compare}
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
              <CookieSettingsButton className="mt-4 text-sm leading-6 text-gray-600 hover:text-gray-900" />
            </div>
          </div>
        </nav>

        <div className="mt-16 flex justify-center space-x-10">
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
        <p className="mt-10 text-center text-xs leading-5 text-gray-500">
          <Trans>
            &copy; {year} {copyrightName}. All rights reserved.
          </Trans>
        </p>
      </div>
    </footer>
  );
}

function FooterList(props: { title: string; items: FooterLink[] }) {
  const { i18n } = useLingui();

  return (
    <>
      <h3 className="text-sm font-semibold leading-6 text-gray-900">
        {props.title}
      </h3>
      <ul className="mt-6 space-y-4">
        {props.items.map((item) => (
          <li key={item.href}>
            <LandingLink
              href={item.href}
              target={item.target}
              prefetch={false}
              className="text-sm leading-6 text-gray-600 hover:text-gray-900"
            >
              {i18n._(item.name)}
            </LandingLink>
          </li>
        ))}
      </ul>
    </>
  );
}
