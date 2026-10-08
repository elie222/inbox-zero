import type { Metadata } from "next";
import Link from "next/link";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ErrorPage } from "@/components/ErrorPage";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Update Inbox Zero Desktop",
};

export default function DesktopUpdateRequiredPage() {
  return (
    <BasicLayout>
      <ErrorPage
        title="Update the desktop app to sign in"
        description="This version of Inbox Zero Desktop can no longer complete sign-in. Download the latest version, reopen the app, and try signing in again."
        button={
          <Button asChild>
            <Link href="/desktop">Download the latest desktop app</Link>
          </Button>
        }
      />
    </BasicLayout>
  );
}
