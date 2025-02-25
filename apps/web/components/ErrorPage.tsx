import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ErrorPage(props: {
  title: string;
  description: string;
  button?: React.ReactNode;
}) {
  return (
    <div className="pb-40 pt-60">
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {props.button || (
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
