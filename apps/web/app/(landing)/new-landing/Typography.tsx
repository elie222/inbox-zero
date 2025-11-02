import { cn } from "@/utils";

const defaultClasses = "font-aeonik";

interface HeadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Heading({ children, className }: HeadingProps) {
  return (
    <h1 className={cn(defaultClasses, "text-5xl", className)}>{children}</h1>
  );
}

interface SubheadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Subheading({ children, className }: SubheadingProps) {
  return (
    <h2 className={cn(defaultClasses, "text-[2.5rem]", className)}>
      {children}
    </h2>
  );
}
