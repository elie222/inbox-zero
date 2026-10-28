import { cn } from "@/utils";

interface HeroRevealProps {
  as?: "div" | "span";
  blur?: boolean;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function HeroReveal({
  as = "div",
  blur = false,
  children,
  className,
  delay = 0,
}: HeroRevealProps) {
  const Comp = as;

  return (
    <Comp
      className={cn(
        blur
          ? "motion-safe:animate-hero-word"
          : "motion-safe:animate-hero-rise",
        as === "span" ? "inline-block" : undefined,
        className,
      )}
      style={{ animationDelay: `${0.04 + delay}s` }}
    >
      {children}
    </Comp>
  );
}
