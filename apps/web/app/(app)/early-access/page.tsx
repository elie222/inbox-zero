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

export default function RequestAccessPage() {
  return (
    <div className="container px-2 pt-2 sm:px-4 sm:pt-8">
      <div className="mx-auto max-w-2xl space-y-4 sm:space-y-8">
        <EarlyAccessFeatures />

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

        {/* <Card className="mx-auto mt-2 w-full max-w-2xl sm:mt-8">
          <PageHeading>Email Client (Beta)</PageHeading>
          <div className="mt-2 max-w-prose">
            <SectionDescription>
              Use the Inbox Zero email client to manage your email.
            </SectionDescription>
          </div>
          <div className="mt-4">
            <Button size="xl" link={{ href: "/mail" }}>
              Open Mail
            </Button>
          </div>
        </Card> */}

        {/* <Card className="mx-auto mt-2 w-full max-w-2xl sm:mt-8">
          <PageHeading>Inbox Zero Daily Challenge</PageHeading>
          <div className="mt-2 max-w-prose">
            <SectionDescription>
              Getting to inbox zero is overwhelming. But doing it for a single day
              is doable.
            </SectionDescription>
            <SectionDescription>
              Daily challenge mode aims to make handling email simpler:
              <ul className="mt-2 list-inside list-disc">
                <li>Handle emails in batches of 5</li>
                <li>Set aside what you want to handle later. Archive the rest</li>
                <li>Long emails summarized</li>
                <li>Timer to maintain focus</li>
              </ul>
            </SectionDescription>
          </div>
          <div className="mt-4">
            <Button size="xl" link={{ href: "/simple" }}>
              Try now
            </Button>
          </div>
        </Card> */}
      </div>
    </div>
  );
}
