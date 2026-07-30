import { Suspense } from "react";
import { AdminUsers } from "@/app/(app)/admin/users/AdminUsers";
import { ErrorPage } from "@/components/ErrorPage";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";

export default async function AdminUsersPage() {
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
      <PageHeader title="Users" />
      <div className="mt-4 mb-20">
        {/* AdminUsers reads ?page via useSearchParams */}
        <Suspense fallback={<Skeleton className="h-64" />}>
          <AdminUsers />
        </Suspense>
      </div>
    </PageWrapper>
  );
}
