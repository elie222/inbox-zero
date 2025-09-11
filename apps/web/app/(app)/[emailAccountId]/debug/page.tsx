import Link from "next/link";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { prefixPath } from "@/utils/path";

export default async function DebugPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;

  return (
    <div className="container mx-auto p-4">
      <PageHeading>Debug</PageHeading>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" asChild>
          <Link href={prefixPath(emailAccountId, "/debug/drafts")}>Drafts</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={prefixPath(emailAccountId, "/debug/rule-history")}>
            Rule History
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={prefixPath(emailAccountId, "/debug/report")}>Report</Link>
        </Button>
      </div>
    </div>
  );
}
