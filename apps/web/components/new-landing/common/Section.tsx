import { cx } from "class-variance-authority";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className, id }: SectionProps) {
  return (
    <section id={id} className={cx("py-6 md:py-16 text-center", className)}>
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
  className = "mt-6 md:mt-10",
  noMarginTop = false,
}: SectionContentProps) {
  return (
    <div className={cx(noMarginTop ? "" : "mt-6 md:mt-10", className)}>
      {children}
    </div>
  );
}
