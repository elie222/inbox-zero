"use client";

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
import { useAccount } from "@/providers/EmailAccountProvider";

export default function RequestAccessPage() {
  const { provider } = useAccount();

  return (
    <div className="container px-2 pt-2 sm:px-4 sm:pt-8">
      <div className="mx-auto max-w-2xl space-y-4 sm:space-y-8">
        <EarlyAccessFeatures />
        {isGoogleProvider(provider) && (
          <Card>
            <CardHeader>
              <CardTitle>Sender Categories</CardTitle>
              <CardDescription>
                Sender Categories is a feature that allows you to categorize
                emails by sender, and take bulk actions or apply rules to them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/smart-categories">Sender Categories</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Early Access</CardTitle>
            <CardDescription>
              Give us feedback on what features you want to see.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/waitlist" target="_blank">
                Feedback Form
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
