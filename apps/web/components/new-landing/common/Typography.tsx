import { cva, cx } from "class-variance-authority";

interface HeadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Heading({ children, className }: HeadingProps) {
  return (
    <h1
      className={cx(
        "font-title text-[#242424] text-[34px] sm:text-5xl md:text-6xl leading-tight",
        className,
      )}
    >
      {children}
    </h1>
  );
}

interface PageHeadingProps {
  children: React.ReactNode;
}

export function PageHeading({ children }: PageHeadingProps) {
  return <Heading className="mx-auto max-w-[780px]">{children}</Heading>;
}

interface SectionHeadingProps {
  children: React.ReactNode;
  wrap?: boolean;
}

export function SectionHeading({ children, wrap }: SectionHeadingProps) {
  return (
    <Subheading className={cx("mx-auto", wrap ? "max-w-[620px]" : "")}>
      {children}
    </Subheading>
  );
}

interface SectionSubtitleProps {
  children: React.ReactNode;
}

export function SectionSubtitle({ children }: SectionSubtitleProps) {
  return (
    <Paragraph className={cx("max-w-[650px] mx-auto mt-2.5")} size="lg">
      {children}
    </Paragraph>
  );
}

interface SubheadingProps {
  children: React.ReactNode;
  className?: string;
}

export function Subheading({ children, className }: SubheadingProps) {
  return (
    <h2
      className={cx(
        "font-title text-[#242424] text-[1.7rem] md:text-[2.5rem] leading-tight",
        className,
      )}
    >
      {children}
    </h2>
  );
}

interface ParagraphProps {
  children: React.ReactNode;
  className?: string;
  color?: "default" | "light" | "dark" | "gray-700" | "gray-500" | "gray-900";
  size?: "default" | "xs" | "sm" | "md" | "lg";
  as?: "p" | "h3";
}

export function Paragraph({
  children,
  className,
  color = "default",
  size = "default",
  as = "p",
}: ParagraphProps) {
  const paragraphStyles = cva("font-geist", {
    variants: {
      color: {
        default: "text-[#848484]",
        light: "text-gray-400",
        dark: "text-[#3D3D3D]",
        "gray-700": "text-gray-700",
        "gray-500": "text-gray-500",
        "gray-900": "text-gray-900",
      },
      size: {
        default: "text-sm md:text-base",
        xs: "text-xs",
        sm: "text-sm",
        md: "text-base",
        lg: "text-lg",
      },
    },
  });
  const ParagraphComponent = as as React.ElementType;

  return (
    <ParagraphComponent className={paragraphStyles({ color, size, className })}>
      {children}
    </ParagraphComponent>
  );
}
