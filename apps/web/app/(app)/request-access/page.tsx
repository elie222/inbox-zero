import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, SectionDescription } from "@/components/Typography";

export default function RequestAccessPage() {
  return (
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
  );
}
