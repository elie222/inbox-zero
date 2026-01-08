import { Suspense } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { CleanHistory } from "@/app/(app)/[emailAccountId]/clean/CleanHistory";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loading } from "@/components/Loading";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { prefixPath } from "@/utils/path";

export default async function CleanHistoryPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;

  return (
    <Card className="my-4 w-full max-w-2xl sm:mx-4 md:mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <PageHeading>Clean History</PageHeading>
          <Button variant="outline" asChild>
            <Link href={prefixPath(emailAccountId, "/clean")}>
              <PlusIcon className="mr-2 size-4" />
              New Clean
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Loading />}>
          <CleanHistory />
        </Suspense>
      </CardContent>
    </Card>
  );
}
