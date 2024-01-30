import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";
import AutoLogOut from "@/app/(landing)/login/error/AutoLogOut";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ErrorPage } from "@/components/ErrorPage";

export default async function LogInErrorPage() {
  const session = await auth();

  return (
    <BasicLayout>
      <ErrorPage
        title="Error Logging In"
        description="There was an error logging in to the app. Please try log in again. If this error persists, please contact support."
        button={
          <Button className="mt-4" size="xl" link={{ href: "/login" }}>
            Log In
          </Button>
        }
      />
      <AutoLogOut loggedIn={!!session?.user.email} />
    </BasicLayout>
  );
}
