import fs from "node:fs";
import path from "node:path";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import {
  hasGoogleOauthConfig,
  hasMicrosoftOauthConfig,
} from "@/utils/oauth/provider-config";
import { getConfiguredRolePrimaryModelEntry } from "@/utils/llms/model";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { initLingui } from "@/utils/i18n/server";

export default async function AdminConfigPage() {
  const i18n = await initLingui();
  const session = await auth();

  const isUserAdmin = await isAdmin({ email: session?.user.email });

  const version = getVersion();
  const defaultLlm = getConfiguredRolePrimaryModelEntry("default");
  const economyLlm = getConfiguredRolePrimaryModelEntry("economy");

  const notConfigured = t(i18n)`not configured`;
  const enabled = t(i18n)`Enabled`;
  const disabled = t(i18n)`Disabled`;
  const configured = t(i18n)`Configured`;
  const notConfiguredLabel = t(i18n)`Not configured`;

  const info = {
    version,
    environment: process.env.NODE_ENV,
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    features: {
      emailSendEnabled: env.NEXT_PUBLIC_EMAIL_SEND_ENABLED,
      contactsEnabled: env.NEXT_PUBLIC_CONTACTS_ENABLED,
      gmailOtherContactsEnabled: env.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED,
      aiModelSettingsDisabled: env.NEXT_PUBLIC_AI_MODEL_SETTINGS_DISABLED,
      bypassPremiumChecks: env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS ?? false,
    },
    providers: {
      google: hasGoogleOauthConfig(),
      microsoft: hasMicrosoftOauthConfig(),
      microsoftTenantConfigured:
        hasMicrosoftOauthConfig() &&
        !!env.MICROSOFT_TENANT_ID &&
        env.MICROSOFT_TENANT_ID !== "common",
    },
    llm: {
      defaultProvider: defaultLlm?.provider ?? notConfigured,
      defaultModel: defaultLlm?.modelName ?? notConfigured,
      economyProvider: economyLlm?.provider ?? notConfigured,
      economyModel: economyLlm?.modelName ?? notConfigured,
    },
    integrations: {
      redis: !!env.REDIS_HTTP_URL || !!env.REDIS_URL,
      qstash: !!env.QSTASH_TOKEN,
      tinybird: !!env.TINYBIRD_TOKEN,
      sentry: !!env.NEXT_PUBLIC_SENTRY_DSN,
      posthog: !!env.NEXT_PUBLIC_POSTHOG_KEY,
      stripe: !!env.STRIPE_SECRET_KEY,
      lemonSqueezy: !!env.LEMON_SQUEEZY_API_KEY,
    },
  };

  return (
    <PageWrapper className="max-w-2xl mx-auto">
      <PageHeader title={t(i18n)`App Configuration`} />

      <div className="space-y-4 mt-4">
        <Section title={t(i18n)`Application`}>
          <Row label={t(i18n)`Version`} value={info.version} />
          <Row label={t(i18n)`Environment`} value={info.environment} />
          <Row label={t(i18n)`Base URL`} value={info.baseUrl} />
        </Section>

        <Section title={t(i18n)`Features`}>
          <Row
            label={t(i18n)`Email Send`}
            value={info.features.emailSendEnabled ? enabled : disabled}
          />
          <Row
            label={t(i18n)`Contacts`}
            value={info.features.contactsEnabled ? enabled : disabled}
          />
          <Row
            label={t(i18n)`Gmail Other Contacts`}
            value={info.features.gmailOtherContactsEnabled ? enabled : disabled}
          />
          <Row
            label={t(i18n)`AI Model Settings`}
            value={info.features.aiModelSettingsDisabled ? disabled : enabled}
          />
          <Row
            label={t(i18n)`Bypass Premium`}
            value={
              info.features.bypassPremiumChecks ? t(i18n)`Yes` : t(i18n)`No`
            }
          />
        </Section>

        <Section title={t(i18n)`Auth Providers`}>
          <Row
            label="Google"
            value={info.providers.google ? configured : notConfiguredLabel}
          />
          <Row
            label="Microsoft"
            value={info.providers.microsoft ? configured : notConfiguredLabel}
          />
          <Row
            label={t(i18n)`Microsoft Tenant`}
            value={
              info.providers.microsoftTenantConfigured
                ? t(i18n)`Single tenant`
                : t(i18n)`Multitenant (common)`
            }
          />
        </Section>

        {isUserAdmin && (
          <>
            <Section title={t(i18n)`LLM Configuration`}>
              <Row
                label={t(i18n)`Default Provider`}
                value={info.llm.defaultProvider}
              />
              <Row
                label={t(i18n)`Default Model`}
                value={info.llm.defaultModel}
              />
              <Row
                label={t(i18n)`Economy Provider`}
                value={info.llm.economyProvider}
              />
              <Row
                label={t(i18n)`Economy Model`}
                value={info.llm.economyModel}
              />
            </Section>

            <Section title={t(i18n)`Integrations`}>
              <Row
                label="Redis"
                value={
                  info.integrations.redis ? configured : notConfiguredLabel
                }
              />
              <Row
                label="QStash"
                value={
                  info.integrations.qstash ? configured : notConfiguredLabel
                }
              />
              <Row
                label="Tinybird"
                value={
                  info.integrations.tinybird ? configured : notConfiguredLabel
                }
              />
              <Row
                label="Sentry"
                value={
                  info.integrations.sentry ? configured : notConfiguredLabel
                }
              />
              <Row
                label="PostHog"
                value={
                  info.integrations.posthog ? configured : notConfiguredLabel
                }
              />
              <Row
                label="Stripe"
                value={
                  info.integrations.stripe ? configured : notConfiguredLabel
                }
              />
              <Row
                label="Lemon Squeezy"
                value={
                  info.integrations.lemonSqueezy
                    ? configured
                    : notConfiguredLabel
                }
              />
            </Section>
          </>
        )}
      </div>
    </PageWrapper>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">
        {title}
      </h2>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | boolean }) {
  const displayValue =
    typeof value === "boolean" ? (
      value ? (
        <Trans>Yes</Trans>
      ) : (
        <Trans>No</Trans>
      )
    ) : (
      value
    );

  return (
    <div className="flex justify-between px-4 py-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-sm text-slate-900">{displayValue}</span>
    </div>
  );
}

// Read version at build time
function getVersion(): string {
  try {
    const versionPath = path.join(process.cwd(), "../../version.txt");
    return fs.readFileSync(versionPath, "utf-8").trim();
  } catch {
    return "unknown";
  }
}
