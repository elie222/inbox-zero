import { Suspense } from "react";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/app/(landing)/login/LoginForm";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import AutoLogOut from "@/app/(landing)/login/error/AutoLogOut";
import { AlertBasic } from "@/components/Alert";
import { env } from "@/env.mjs";

export const metadata: Metadata = {
  title: "Log in | Inbox Zero",
  description: "Log in to Inbox Zero.",
  alternates: { canonical: "/login" },
};

export default async function AuthenticationPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const session = await auth();
  if (session?.user.email && !searchParams?.error) redirect("/welcome");

  return (
    <div className="flex h-screen flex-col justify-center text-gray-900">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col text-center">
          <h1 className="font-cal text-2xl">Sign In</h1>
          <p className="mt-4">Your AI personal assistant for email.</p>
        </div>
        <div className="mt-4">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        {searchParams?.error && (
          <>
            <AlertBasic
              variant="destructive"
              title="Error logging in"
              description={`There was an error logging in. Please try log in again. If this error persists please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
            />
            <Suspense>
              <AutoLogOut loggedIn={!!session?.user.email} />
            </Suspense>
          </>
        )}

        <p className="px-8 pt-10 text-center text-sm text-gray-500">
          By clicking continue, you agree to our{" "}
          <Link
            href="/terms"
            className="underline underline-offset-4 hover:text-gray-900"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-gray-900"
          >
            Privacy Policy
          </Link>
          .
        </p>

        <p className="px-4 pt-4 text-center text-sm text-gray-500">
          Inbox Zero{"'"}s use and transfer of information received from Google
          APIs to any other app will adhere to{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="underline underline-offset-4 hover:text-gray-900"
          >
            Google API Services User Data
          </a>{" "}
          Policy, including the Limited Use requirements.
        </p>
      </div>
    </div>
  );
}
