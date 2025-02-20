import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeading, TypographyP } from "@/components/Typography";

export function ErrorPage(props: {
  title: string;
  description: string;
  button?: React.ReactNode;
}) {
  return (
    <div className="pb-40 pt-60">
      <Card className="mx-auto max-w-xl text-center">
        <PageHeading>{props.title}</PageHeading>
        <div className="mt-2">
          <TypographyP>{props.description}</TypographyP>
        </div>
        {props.button || (
          <Button className="mt-4" size="lg" asChild>
            <Link href="/">Return Home</Link>
          </Button>
        )}
      </Card>
    </div>
  );
}
