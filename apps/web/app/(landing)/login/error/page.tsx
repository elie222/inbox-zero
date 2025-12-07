"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
import { getAndClearAuthErrorCookie } from "@/utils/auth-cookies";

const errorMessages: Record<string, { title: string; description: string }> = {
  email_not_found: {
    title: "Account Not Authorized",
    description:
      "Your account is not authorized to access this application. This may be because your email is not part of the allowed organization. Please contact your administrator or try signing in with a different account.",
  },
};

function LoginErrorContent() {
  const { data, isLoading, error } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");

  // For some reason users are being sent to this page when logged in
  // This will redirect them out of this page to the app
  useEffect(() => {
    if (data?.id) {
      const authErrorCookie = getAndClearAuthErrorCookie();

      if (authErrorCookie) {
        router.push("/accounts");
      } else {
        router.push(WELCOME_PATH);
      }
    }
  }, [data, router]);

  if (isLoading) return <Loading />;
  // will redirect to welcome if user is logged in
  if (data?.id) return <Loading />;

  const errorInfo = errorCode ? errorMessages[errorCode] : null;
  const title = errorInfo?.title || "Error Logging In";
  const supportText = `If this error persists, please use the support chat or email us at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}.`;
  const description = errorInfo?.description
    ? `${errorInfo.description} ${supportText}`
    : `Please try again. ${supportText}`;

  return (
    <LoadingContent loading={isLoading} error={error}>
      <ErrorPage
        title={title}
        description={description}
        button={
          <Button asChild>
            <Link href="/login">Log In</Link>
          </Button>
        }
      />
      {/* <AutoLogOut loggedIn={!!session?.user.email} /> */}
    </LoadingContent>
  );
}

export default function LogInErrorPage() {
  return (
    <BasicLayout>
      <Suspense fallback={<Loading />}>
        <LoginErrorContent />
      </Suspense>

      <Suspense>
        <CrispChatLoggedOutVisible />
      </Suspense>
    </BasicLayout>
  );
}
