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
      <div className="flex items-center mt-1">
        <PageSubHeading>{description}</PageSubHeading>
        {extra}
      </div>
    </div>
  );
}
