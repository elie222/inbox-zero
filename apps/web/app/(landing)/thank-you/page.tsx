import { Button } from "@/components/Button";
import { PageHeading, TypographyP } from "@/components/Typography";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { CardBasic } from "@/components/ui/card";

// same component as not-found
export default function ThankYouPage() {
  return (
    <BasicLayout>
      <div className="pb-40 pt-60">
        <CardBasic className="mx-auto max-w-xl text-center">
          <PageHeading>Thank you!</PageHeading>
          <div className="mt-2">
            <TypographyP>
              Your premium purchase was successful. Thank you for supporting us!
            </TypographyP>
          </div>
          <Button className="mt-4" size="xl" link={{ href: "/welcome" }}>
            Continue
          </Button>
        </CardBasic>
      </div>
    </BasicLayout>
  );
}
