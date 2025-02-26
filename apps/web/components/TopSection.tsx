import { PageHeading, SectionDescription } from "@/components/Typography";

export function TopSection(props: {
  title: string;
  description?: string;
  descriptionComponent?: React.ReactNode;
}) {
  return (
    <div className="content-container border-border bg-background border-b py-4 shadow-xs sm:py-6">
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
    <div className="content-container border-border bg-background flex items-center justify-between border-b py-6 shadow-xs">
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
