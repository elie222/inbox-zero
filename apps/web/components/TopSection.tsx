import { PageHeading, SectionDescription } from "@/components/Typography";

export function TopSection(props: {
  title: string;
  description?: string;
  descriptionComponent?: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-200 bg-white px-4 py-6 shadow-sm sm:px-6 lg:px-8">
      <PageHeading>{props.title}</PageHeading>
      <div className="mt-2">
        {props.descriptionComponent ? (
          props.descriptionComponent
        ) : (
          <SectionDescription className="max-w-prose">
            {props.description}
          </SectionDescription>
        )}
      </div>
    </div>
  );
}
