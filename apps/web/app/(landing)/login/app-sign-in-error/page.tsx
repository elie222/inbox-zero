import type { Metadata } from "next";
import Link from "next/link";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ErrorPage } from "@/components/ErrorPage";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "App sign-in didn't finish",
};

export default function AppSignInErrorPage() {
  return (
    <BasicLayout>
      <ErrorPage
        title="App sign-in didn't finish"
        description="Return to the app and start sign-in again. If you're using Inbox Zero Desktop and this keeps happening, install the latest version."
        button={
          <Button asChild>
            <Link href="/desktop">Get the latest desktop app</Link>
          </Button>
        }
      />
    </BasicLayout>
  );
}
