"use client";

import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import { EarlyAccessFeatures } from "@/app/(app)/early-access/EarlyAccessFeatures";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function RequestAccessPage() {
  const { emailAccountId, provider } = useAccount();

  return (
    <div className="container px-2 pt-2 sm:px-4 sm:pt-8">
      <div className="mx-auto max-w-2xl space-y-4 sm:space-y-8">
        <EarlyAccessFeatures />
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>Mail</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>Open your inbox in the Inbox Zero mail client.</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailAccountId ? (
              <Button asChild>
                <Link href={prefixPath(emailAccountId, "/mail")}>
                  <Trans>Open Mail</Trans>
                </Link>
              </Button>
            ) : (
              <Button disabled>
                <Trans>Open Mail</Trans>
              </Button>
            )}
          </CardContent>
        </Card>
        {isGoogleProvider(provider) && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  <Trans>Sender categories</Trans>
                </CardTitle>
                <CardDescription>
                  <Trans>
                    Sender Categories is a feature that allows you to categorize
                    emails by sender, and take bulk actions or apply rules to
                    them.
                  </Trans>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/smart-categories">
                    <Trans>Sender Categories</Trans>
                  </Link>
                </Button>
              </CardContent>
            </Card>
            {/* <Card>
              <CardHeader>
                <CardTitle>Bulk archive</CardTitle>
                <CardDescription>
                  Archive emails from multiple senders at once, organized by
                  category.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/bulk-archive">Bulk Archive</Link>
                </Button>
              </CardContent>
            </Card> */}
            {/* <Card>
              <CardHeader>
                <CardTitle>Quick bulk archive</CardTitle>
                <CardDescription>
                  Quickly archive emails from multiple senders at once, grouped
                  by AI confidence level.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/quick-bulk-archive">Quick Bulk Archive</Link>
                </Button>
              </CardContent>
            </Card> */}
          </>
        )}
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>Early access</Trans>
            </CardTitle>
            <CardDescription>
              <Trans>Give us feedback on what features you want to see.</Trans>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/waitlist" target="_blank">
                <Trans>Feedback Form</Trans>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
