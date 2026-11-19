import type { Metadata } from "next";
import { t } from "@lingui/core/macro";
import { SettingsPageContent } from "@/app/(app)/settings/SettingsPageContent";
import { PageHeader } from "@/components/PageHeader";
import { getBrandTitle } from "@/utils/branding";
import { initLingui } from "@/utils/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: getBrandTitle(t(i18n)`Settings`) };
}

export default async function SettingsPage() {
  const i18n = await initLingui();

  return (
    <div className="content-container pb-12">
      <div className="mx-auto max-w-5xl space-y-10 pt-4">
        <PageHeader title={t(i18n)`Settings`} />
        <SettingsPageContent />
      </div>
    </div>
  );
}
