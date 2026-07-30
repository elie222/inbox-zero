import type React from "react";
import { ErrorPage } from "@/components/ErrorPage";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";

/**
 * Gates the whole /admin segment for nav and UX purposes.
 *
 * Every page still repeats this check: a layout that returns early does not
 * stop its page segment executing, so the layout alone is not a boundary. The
 * real boundary is server-side — `withAdmin` on every admin API route.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description="You do not have permission to access this page."
      />
    );
  }

  return <>{children}</>;
}
