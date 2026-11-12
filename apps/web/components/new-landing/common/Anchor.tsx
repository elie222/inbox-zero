import { cn } from "@/utils";
import { LandingLink } from "@/components/new-landing/LandingLink";

interface AnchorProps {
  children: React.ReactNode;
  className?: string;
  href: string;
  newTab?: boolean;
}

export function Anchor({ href, newTab, className, children }: AnchorProps) {
  return (
    <LandingLink
      href={href}
      target={newTab ? "_blank" : undefined}
      className={cn("underline", className)}
    >
      {children}
    </LandingLink>
  );
}
