import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, SectionDescription } from "@/components/Typography";

export default function RequestAccessPage() {
  return (
    <Card className="mx-auto mt-8 w-full max-w-2xl">
      <PageHeading>Request Access</PageHeading>
      <div className="mt-2 max-w-prose">
        <SectionDescription>
          This feature is currently in early access.
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
