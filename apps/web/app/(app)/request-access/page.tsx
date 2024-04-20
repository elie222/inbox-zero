import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, SectionDescription } from "@/components/Typography";

export default function RequestAccessPage() {
  return (
    <div className="px-4">
      <Card className="mx-auto mt-8 w-full max-w-2xl">
        <PageHeading>Request Access</PageHeading>
        <div className="mt-2 max-w-prose">
          <SectionDescription>
            {`"Emails without a Reply" and "Bulk Archive" are currently in early access. Request access to be notified when they are available.`}
          </SectionDescription>
        </div>
        <div className="mt-4">
          <Button size="xl" link={{ href: "/waitlist", target: "_blank" }}>
            Request Access
          </Button>
        </div>
      </Card>

      <Card className="mx-auto mt-8 w-full max-w-2xl">
        <PageHeading>Email Client</PageHeading>
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
      </Card>

      <Card className="mx-auto mt-8 w-full max-w-2xl">
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
      </Card>
    </div>
  );
}
