import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { Locale } from "@/utils/i18n/locales";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";
import { Hero, HeroContent } from "@/app/(landing)/home/Hero";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { Awards } from "@/components/new-landing/sections/Awards";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BulkUnsubscribe } from "@/components/new-landing/sections/BulkUnsubscribe";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { ManageFromAnywhere } from "@/components/new-landing/sections/ManageFromAnywhere";
import {
  EMAIL_CLIENT_SECTION_ID,
  EmailClient,
} from "@/components/new-landing/sections/EmailClient";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { WordReveal } from "@/components/new-landing/common/WordReveal";
import { SectionLink } from "@/components/new-landing/common/SectionLink";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

export function HomePage({ locale }: { locale: Locale }) {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return (
      <BasicLayout locale={locale}>
        <Hero
          title={<Trans>{BRAND_NAME} for self-hosted teams</Trans>}
          subtitle={
            <Trans>
              Deploy {BRAND_NAME} on your own infrastructure and automate your
              inbox with full data control.
            </Trans>
          }
        />
      </BasicLayout>
    );
  }

  return (
    <BasicLayout locale={locale}>
      <Hero
        badge={
          <SectionLink sectionId={EMAIL_CLIENT_SECTION_ID}>
            <Trans>New: Inbox Zero Mail app →</Trans>
          </SectionLink>
        }
        title={<HeroTitle />}
        subtitle={
          <Trans>
            {BRAND_NAME} organizes your inbox and calendar, drafts replies in
            your voice, and helps you reach inbox zero fast. Never miss an
            important email again.
          </Trans>
        }
      >
        <HeroContent />
      </Hero>
      <OrganizedInbox
        title={
          <Trans>
            Automatically organized.
            <br />
            Never miss an important email again.
          </Trans>
        }
        subtitle={
          <Trans>
            Drowning in emails? Don't waste energy trying to prioritize your
            emails. Our AI assistant will label everything automatically.
          </Trans>
        }
      />
      <PreWrittenDrafts
        title={<Trans>Pre-written drafts waiting in your inbox</Trans>}
        subtitle={
          <Trans>
            When you check your inbox, every email needing a response will have
            a pre-drafted reply in your tone, ready for you to send.
          </Trans>
        }
      />
      <ManageFromAnywhere />
      <EmailClient />
      <StartedInMinutes
        title={<Trans>Get started in minutes</Trans>}
        subtitle={
          <Trans>
            One-click setup. Start organizing and drafting replies in minutes.
          </Trans>
        }
      />
      <BulkUnsubscribe />
      <EverythingElseSection />
      <Awards />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <FAQs />
    </BasicLayout>
  );
}

// Starred words in the translated title render in italics, e.g. *actually*.
function HeroTitle() {
  const { i18n } = useLingui();
  // *starred* text is emphasized; translations may star more than one word.
  const words = i18n
    ._(msg`Meet your AI email assistant that *actually* works`)
    .split(/(\*[^*]+\*)/)
    .flatMap((part, partIndex) => {
      const emphasized = part.startsWith("*") && part.endsWith("*");
      const text = emphasized ? part.slice(1, -1) : part;
      return text
        .split(" ")
        .filter(Boolean)
        .map((word, wordIndex) =>
          emphasized ? <em key={`${partIndex}-${wordIndex}`}>{word}</em> : word,
        );
    });

  return <WordReveal spaceBetween="w-2 md:w-3" words={words} />;
}
