import { PageHeading, SectionDescription } from "@/components/Typography";

export function TopSection(props: {
  title: string;
  description?: string;
  descriptionComponent?: React.ReactNode;
}) {
  return (
    <div className="content-container border-b border-border bg-background py-4 shadow-sm sm:py-6">
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

export function TopSectionWithRightSection(props: {
  title: string;
  description?: string;
  descriptionComponent?: React.ReactNode;
  rightComponent: React.ReactNode;
}) {
  return (
    <div className="content-container flex items-center justify-between border-b border-border bg-background py-6 shadow-sm">
      <div>
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
      <div>{props.rightComponent}</div>
    </div>
  );
}
