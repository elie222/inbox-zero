import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageHeading, TypographyP } from "@/components/Typography";

export function ErrorPage(props: { title: string; description: string }) {
  return (
    <div className="pb-40 pt-60">
      <Card className="mx-auto max-w-xl text-center">
        <PageHeading>{props.title}</PageHeading>
        <div className="mt-2">
          <TypographyP>{props.description}</TypographyP>
        </div>
        <Button className="mt-4" size="xl" link={{ href: "/" }}>
          Return Home
        </Button>
      </Card>
    </div>
  );
}
