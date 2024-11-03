import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, SectionDescription } from "@/components/Typography";

export default function RequestAccessPage() {
  return (
    <div className="px-2 sm:px-4">
      <Card className="mx-auto mt-2 w-full max-w-2xl sm:mt-8">
        <PageHeading>Enable Early Access Features</PageHeading>
        <div className="mt-2 max-w-prose">
          <SectionDescription>
            Enable early access features to test and provide feedback.
          </SectionDescription>
        </div>
        <div className="mt-4">
          <Button id="beta-button" size="xl">
            Enable Early Access Features
          </Button>
        </div>
      </Card>

      <Card className="mx-auto mt-2 w-full max-w-2xl sm:mt-8">
        <PageHeading>Early Access</PageHeading>

        <div className="mt-2 max-w-prose">
          <SectionDescription>
            Give us feedback on what features you want to see.
          </SectionDescription>
        </div>
        <div className="mt-4">
          <Button size="xl" link={{ href: "/waitlist", target: "_blank" }}>
            Feedback Form
          </Button>
        </div>
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
  );
}
