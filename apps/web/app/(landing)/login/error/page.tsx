"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ErrorPage } from "@/components/ErrorPage";
import { env } from "@/env";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";
import { Loading } from "@/components/Loading";
import { WELCOME_PATH } from "@/utils/config";
import { CrispChatLoggedOutVisible } from "@/components/CrispChat";

export default function LogInErrorPage() {
  const { data, isLoading, error } = useUser();
  const router = useRouter();

  // For some reason users are being sent to this page when logged in
  // This will redirect them out of this page to the app
  useEffect(() => {
    if (data?.id) {
      router.push(WELCOME_PATH);
    }
  }, [data, router]);

  if (isLoading) return <Loading />;
  // will redirect to welcome if user is logged in
  if (data?.id) return <Loading />;

  return (
    <BasicLayout>
      <LoadingContent loading={isLoading} error={error}>
        <ErrorPage
          title="Error Logging In"
          description={`Please try again. If this error persists, please use the support chat or email us at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}.`}
          button={
            <Button asChild>
              <Link href="/login">Log In</Link>
            </Button>
          }
        />
        {/* <AutoLogOut loggedIn={!!session?.user.email} /> */}
      </LoadingContent>

      <Suspense>
        <CrispChatLoggedOutVisible />
      </Suspense>
    </BasicLayout>
  );
}
