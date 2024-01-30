import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";
import { BasicLayout } from "@/components/layouts/BasicLayout";

// same component as not-found
export default function ThankYouPage() {
  return (
    <BasicLayout>
      <div className="pb-40 pt-60">
        <Card className="mx-auto max-w-xl text-center">
          <PageHeading>Thank you!</PageHeading>
          <div className="mt-2">
            <TypographyP>
              Your premium purchase was successful. Thank you for supporting us!
            </TypographyP>
          </div>
          <Button className="mt-4" size="xl" link={{ href: "/welcome" }}>
            Continue
          </Button>
        </Card>
      </div>
    </BasicLayout>
  );
}
