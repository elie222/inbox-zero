import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";
import { ErrorPage } from "@/components/ErrorPage";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { AllowlistSettings } from "./components/AllowlistSettings";
import prisma from "@/utils/prisma";

export default async function AdminPluginsPage() {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description="You do not have permission to access this page."
      />
    );
  }

  // fetch current allowlist settings from organization
  const org = await prisma.organization.findFirst();

  const allowedPlugins = org?.allowedPlugins ?? [];
  const mode = allowedPlugins.length === 0 ? "all" : "selected";

  return (
    <PageWrapper>
      <PageHeader title="Plugin Management" />

      <div className="mt-4 mb-20">
        <AllowlistSettings
          initialMode={mode}
          initialAllowedPlugins={allowedPlugins}
        />
      </div>
    </PageWrapper>
  );
}
