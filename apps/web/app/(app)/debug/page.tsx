import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function DebugPage() {
  return (
    <div className="container mx-auto p-4">
      <PageHeading>Debug</PageHeading>

      <div className="space-y-2 mt-2">
        <Button variant="outline" asChild>
          <Link href="/debug/learned">Learned Patterns</Link>
        </Button>
      </div>
    </div>
  );
}
