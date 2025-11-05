import { cn } from "@/utils";
import { cva } from "class-variance-authority";

const defaultClasses = "font-aeonik";

interface HeadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Heading({ children, className }: HeadingProps) {
  return (
    <h1
      className={cn(
        defaultClasses,
        "text-[#242424] text-4xl md:text-5xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

interface SubheadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Subheading({ children, className }: SubheadingProps) {
  return (
    <h2
      className={cn(
        defaultClasses,
        "text-[#242424] text-[1.7rem] md:text-[2.5rem] leading-tight",
        className,
      )}
    >
      {children}
    </h2>
  );
}

interface ParagraphProps {
  children: React.ReactNode;
  variant?:
    | "default"
    | "light"
    | "testimonial-body"
    | "testimonial-body-featured"
    | "testimonial-author-name"
    | "testimonial-author-handle";
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
        default: "text-sm md:text-base text-[#848484]",
        light: "text-sm md:text-base text-gray-400",
        "testimonial-body": "text-lg md:text-base text-[#848484] text-gray-500",
        "testimonial-body-featured":
          "text-lg md:text-base text-[#848484] text-gray-700 text-lg font-semibold leading-7 tracking-tight",
        "testimonial-author-name":
          "font-semibold text-lg md:text-base text-[#3D3D3D]",
        "testimonial-author-handle": "text-lg md:text-base text-[#848484]",
      },
    },
  });

  return <p className={paragraphStyles({ variant, className })}>{children}</p>;
}
