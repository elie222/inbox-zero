interface SectionProps {
  children: React.ReactNode;
}

export function Section({ children }: SectionProps) {
  return <section className="py-6 md:py-16 text-center">{children}</section>;
}

interface SectionContentProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionContent({
  children,
  className = "mt-6 md:mt-10",
}: SectionContentProps) {
  return <div className={className}>{children}</div>;
}
