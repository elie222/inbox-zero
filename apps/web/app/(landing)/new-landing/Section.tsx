import { cn } from "@/utils";

interface SectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wrap?: boolean;
}

export function Section({ title, subtitle, children, wrap }: SectionProps) {
  return (
    <section className="py-16 text-center">
      <h1
        className={cn(
          "text-4xl font-bold mx-auto",
          wrap ? "max-w-[540px]" : "",
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="text-gray-500 max-w-[650px] mx-auto mt-4">{subtitle}</p>
      ) : null}
      <div className="mt-10 flex justify-center">{children}</div>
    </section>
  );
}
