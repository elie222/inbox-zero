import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { Footer } from "@/app/(landing)/home/Footer";
import { Header } from "@/app/(landing)/home/Header";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";
import AutoLogOut from "@/app/(landing)/login/error/AutoLogOut";

export default async function LogInErrorPage() {
  const session = await auth();

  return (
    <div className="bg-white">
      <Header />

      <div className="pb-40 pt-60">
        <Card className="mx-auto max-w-xl text-center">
          <PageHeading>Error Logging In</PageHeading>
          <div className="mt-2">
            <TypographyP>
              There was an error logging in to the app. Please try log in again.
              If this error persists, please contact support.
            </TypographyP>
          </div>
          <Button className="mt-4" size="xl" link={{ href: "/login" }}>
            Log In
          </Button>
        </Card>
      </div>

      <Footer />

      <AutoLogOut loggedIn={!!session?.user.email} />
    </div>
  );
}
