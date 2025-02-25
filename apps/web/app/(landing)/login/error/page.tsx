import Link from "next/link";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Button } from "@/components/ui/button";
import AutoLogOut from "@/app/(landing)/login/error/AutoLogOut";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ErrorPage } from "@/components/ErrorPage";
import { env } from "@/env";

export default async function LogInErrorPage() {
  const session = await auth();

  return (
    <BasicLayout>
      <ErrorPage
        title="Error Logging In"
        description={`There was an error logging in to the app. Please try log in again. If this error persists, please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}.`}
        button={
          <Button asChild>
            <Link href="/login">Log In</Link>
          </Button>
        }
      />
      <AutoLogOut loggedIn={!!session?.user.email} />
    </BasicLayout>
  );
}
