import { cn } from "@/utils";
import { cva } from "class-variance-authority";

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

interface ParagraphProps {
  children: React.ReactNode;
  variant?: "default" | "light";
  className?: string;
}

export function Paragraph({
  children,
  className,
  variant = "default",
}: ParagraphProps) {
  const paragraphStyles = cva("", {
    variants: {
      variant: {
        default: "text-gray-500",
        light: "text-gray-400",
      },
    },
  });

  return <p className={paragraphStyles({ variant, className })}>{children}</p>;
}
