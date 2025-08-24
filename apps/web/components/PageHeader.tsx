import { PageHeading, PageSubHeading } from "@/components/Typography";

export function PageHeader({
  title,
  description,
  extra,
}: {
  title: string;
  description: string;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <PageHeading>{title}</PageHeading>
      <PageSubHeading className="mt-1 flex items-center">
        {description}
        {extra}
      </PageSubHeading>
    </div>
  );
}
