import { cn } from "@/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className, id }: SectionProps) {
  return (
    <section id={id} className={cn("py-6 md:py-16 text-center", className)}>
      {children}
    </section>
  );
}

interface SectionContentProps {
  children: React.ReactNode;
  className?: string;
  noMarginTop?: boolean;
}

export function SectionContent({
  children,
  className,
  noMarginTop = false,
}: SectionContentProps) {
  return (
    <div className={cn(noMarginTop ? "" : "mt-6 md:mt-10", className)}>
      {children}
    </div>
  );
}
