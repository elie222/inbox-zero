import { AdminErrors } from "@/app/(app)/admin/errors/AdminErrors";
import { ErrorPage } from "@/components/ErrorPage";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";

export default async function AdminErrorsPage() {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description="You do not have permission to access this page."
      />
    );
  }

  return (
    <PageWrapper>
      <PageHeader title="Errors" />
      <div className="mt-4 mb-20">
        <AdminErrors />
      </div>
    </PageWrapper>
  );
}
