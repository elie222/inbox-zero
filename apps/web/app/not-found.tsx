import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export default function NotFound() {
  return (
    <BasicLayout>
      <div className="pb-40 pt-60">
        <Card className="mx-auto max-w-xl text-center">
          <PageHeading>Page Not Found</PageHeading>
          <div className="mt-2">
            <TypographyP>
              The page you are looking for could not be found.
            </TypographyP>
          </div>
          <Button className="mt-4" size="xl" link={{ href: "/" }}>
            Return Home
          </Button>
        </Card>
      </div>
    </BasicLayout>
  );
}
