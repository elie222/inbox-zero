import fs from "node:fs";
import path from "node:path";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

export default async function AdminConfigPage() {
  const session = await auth();

  const isUserAdmin = await isAdmin({ email: session?.user.email });

  const version = getVersion();

  const info = {
    version,
    environment: process.env.NODE_ENV,
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    features: {
      emailSendEnabled: env.NEXT_PUBLIC_EMAIL_SEND_ENABLED,
      contactsEnabled: env.NEXT_PUBLIC_CONTACTS_ENABLED,
      bypassPremiumChecks: env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS ?? false,
    },
    providers: {
      google: !!env.GOOGLE_CLIENT_ID,
      microsoft: !!env.MICROSOFT_CLIENT_ID,
      microsoftTenantConfigured:
        !!env.MICROSOFT_TENANT_ID && env.MICROSOFT_TENANT_ID !== "common",
    },
    llm: {
      defaultProvider: env.DEFAULT_LLM_PROVIDER,
      defaultModel: env.DEFAULT_LLM_MODEL ?? "default",
      economyProvider: env.ECONOMY_LLM_PROVIDER ?? "not configured",
      economyModel: env.ECONOMY_LLM_MODEL ?? "not configured",
    },
    integrations: {
      redis: !!env.UPSTASH_REDIS_URL || !!env.REDIS_URL,
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
      <PageHeader title="App Configuration" />

      <div className="space-y-4 mt-4">
        <Section title="Application">
          <Row label="Version" value={info.version} />
          <Row label="Environment" value={info.environment} />
          <Row label="Base URL" value={info.baseUrl} />
        </Section>

        <Section title="Features">
          <Row
            label="Email Send"
            value={info.features.emailSendEnabled ? "Enabled" : "Disabled"}
          />
          <Row
            label="Contacts"
            value={info.features.contactsEnabled ? "Enabled" : "Disabled"}
          />
          <Row
            label="Bypass Premium"
            value={info.features.bypassPremiumChecks ? "Yes" : "No"}
          />
        </Section>

        <Section title="Auth Providers">
          <Row
            label="Google"
            value={info.providers.google ? "Configured" : "Not configured"}
          />
          <Row
            label="Microsoft"
            value={info.providers.microsoft ? "Configured" : "Not configured"}
          />
          <Row
            label="Microsoft Tenant"
            value={
              info.providers.microsoftTenantConfigured
                ? "Single tenant"
                : "Multitenant (common)"
            }
          />
        </Section>

        {isUserAdmin && (
          <>
            <Section title="LLM Configuration">
              <Row label="Default Provider" value={info.llm.defaultProvider} />
              <Row label="Default Model" value={info.llm.defaultModel} />
              <Row label="Economy Provider" value={info.llm.economyProvider} />
              <Row label="Economy Model" value={info.llm.economyModel} />
            </Section>

            <Section title="Integrations">
              <Row
                label="Redis"
                value={
                  info.integrations.redis ? "Configured" : "Not configured"
                }
              />
              <Row
                label="QStash"
                value={
                  info.integrations.qstash ? "Configured" : "Not configured"
                }
              />
              <Row
                label="Tinybird"
                value={
                  info.integrations.tinybird ? "Configured" : "Not configured"
                }
              />
              <Row
                label="Sentry"
                value={
                  info.integrations.sentry ? "Configured" : "Not configured"
                }
              />
              <Row
                label="PostHog"
                value={
                  info.integrations.posthog ? "Configured" : "Not configured"
                }
              />
              <Row
                label="Stripe"
                value={
                  info.integrations.stripe ? "Configured" : "Not configured"
                }
              />
              <Row
                label="Lemon Squeezy"
                value={
                  info.integrations.lemonSqueezy
                    ? "Configured"
                    : "Not configured"
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
    typeof value === "boolean" ? (value ? "Yes" : "No") : value;

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
