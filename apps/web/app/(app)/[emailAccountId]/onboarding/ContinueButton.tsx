import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

export function ContinueButton({ href }: { href: string }) {
  return (
    <Button asChild size="sm" variant="primaryBlue">
      <Link href={href}>
        Continue <ArrowRightIcon className="size-4 ml-2" />
      </Link>
    </Button>
  );
}
