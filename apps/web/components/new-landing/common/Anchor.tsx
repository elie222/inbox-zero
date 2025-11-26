import { cn } from "@/utils";
import Link from "next/link";

interface AnchorProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  newTab?: boolean;
}

export function Anchor({ href, newTab, className, children }: AnchorProps) {
  return (
    <Link
      href={href}
      target={newTab ? "_blank" : undefined}
      className={cn("underline", className)}
    >
      {children}
    </Link>
  );
}
