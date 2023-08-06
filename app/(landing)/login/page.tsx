import { LoginForm } from "@/app/(landing)/login/LoginForm";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Authentication",
  description: "Authentication forms built using the components.",
};

export default function AuthenticationPage() {
  return (
    <div className="flex h-screen flex-col justify-center text-gray-900">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col text-center">
          <h1 className="font-cal text-2xl font-semibold">Sign In</h1>
          <p className="mt-4">Get to Inbox Zero in no time.</p>
        </div>
        <LoginForm />
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
            href="/terms"
            className="underline underline-offset-4 hover:text-gray-900"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
