import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

type FeatureMessages = {
  text: MessageDescriptor;
  tooltip?: MessageDescriptor;
};

// config.ts also feeds server code and the marketing site, so the in-app
// pricing UI keeps its translatable copies here. Keyed by tier name, and each
// feature by its English text in config.ts.
export const TIER_MESSAGES: Record<
  string,
  {
    description: MessageDescriptor;
    cta: MessageDescriptor;
    features: Record<string, FeatureMessages>;
  }
> = {
  Starter: {
    description: msg`For individuals, entrepreneurs, and executives looking to buy back their time.`,
    cta: msg`Try free for 7 days`,
    features: {
      "Sorts and labels every email": {
        text: msg`Sorts and labels every email`,
      },
      "Drafts replies in your voice": {
        text: msg`Drafts replies in your voice`,
      },
      "Blocks cold emails": { text: msg`Blocks cold emails` },
      "Bulk unsubscribe and archive emails": {
        text: msg`Bulk unsubscribe and archive emails`,
      },
      "Email analytics": { text: msg`Email analytics` },
      "Pre-meeting briefings": {
        text: msg`Pre-meeting briefings`,
        tooltip: msg`Get AI briefings before every meeting with research on attendees and context from your inbox.`,
      },
    },
  },
  Plus: {
    description: msg`For power users who need integrations and deeper knowledge base support.`,
    cta: msg`Try free for 7 days`,
    features: {
      "Everything in Starter, plus:": {
        text: msg`Everything in Starter, plus:`,
      },
      "AI meeting notetaker": {
        text: msg`AI meeting notetaker`,
        tooltip: msg`A notetaker joins your video calls and turns them into transcripts, summaries, recap emails, and follow-up drafts.`,
      },
      "Slack integration": {
        text: msg`Slack integration`,
        tooltip: msg`Forward important emails and notifications to your Slack channels automatically.`,
      },
      "App integrations": {
        text: msg`App integrations`,
        tooltip: msg`Connect Notion, Stripe, Monday.com, and more so the AI can use data from your tools when drafting replies and meeting briefs.`,
      },
      "Email digests": {
        text: msg`Email digests`,
        tooltip: msg`Group emails from selected rules into a scheduled summary instead of reading each message individually.`,
      },
      "Auto-file attachments": {
        text: msg`Auto-file attachments`,
        tooltip: msg`Automatically organize and file email attachments to your preferred storage.`,
      },
      "Unlimited knowledge base": {
        text: msg`Unlimited knowledge base`,
        tooltip: msg`The knowledge base is used to help draft responses. Store unlimited content in your knowledge base.`,
      },
    },
  },
  Professional: {
    description: msg`For teams and growing businesses handling high email volumes.`,
    cta: msg`Try free for 7 days`,
    features: {
      "Everything in Plus, plus:": { text: msg`Everything in Plus, plus:` },
      "Team-wide analytics": { text: msg`Team-wide analytics` },
      "Priority support": { text: msg`Priority support` },
      "Dedicated onboarding manager": {
        text: msg`Dedicated onboarding manager`,
        tooltip: msg`We'll help you get set up on an onboarding call. Book as many free calls as needed.`,
      },
    },
  },
  Enterprise: {
    description: msg`For organizations with enterprise-grade security and compliance requirements.`,
    cta: msg`Speak to sales`,
    features: {
      "Everything in Team, plus:": { text: msg`Everything in Team, plus:` },
      "SSO login": { text: msg`SSO login` },
      "SCIM user provisioning": { text: msg`SCIM user provisioning` },
      "On-premise deployment (optional)": {
        text: msg`On-premise deployment (optional)`,
      },
      "Advanced security & SLA": { text: msg`Advanced security & SLA` },
      "Dedicated account manager & training": {
        text: msg`Dedicated account manager & training`,
      },
    },
  },
};
