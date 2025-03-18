import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { CleanHistory } from "@/app/(app)/clean/CleanHistory";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";

export default function CleanHistoryPage() {
  return (
    <Card className="my-4 w-full max-w-2xl sm:mx-4 md:mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <PageHeading>Clean History</PageHeading>
          <Button variant="outline" asChild>
            <Link href="/clean">
              <PlusIcon className="mr-2 size-4" />
              New Clean
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <CleanHistory />
      </CardContent>
    </Card>
  );
}
