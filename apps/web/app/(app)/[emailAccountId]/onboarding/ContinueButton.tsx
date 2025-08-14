import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ContinueButtonLink({ href }: { href: string }) {
  return (
    <Button asChild size="sm" variant="primaryBlue">
      <Link href={href}>
        Continue <ArrowRightIcon className="size-4 ml-2" />
      </Link>
    </Button>
  );
}

export function ContinueButton(props: ButtonProps) {
  return (
    <Button size="sm" variant="primaryBlue" {...props}>
      Continue <ArrowRightIcon className="size-4 ml-2" />
    </Button>
  );
}
