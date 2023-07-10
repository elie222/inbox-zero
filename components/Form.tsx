import { SectionDescription, SectionHeader } from "@/components/Typography";

export function FormWrapper(props: { children: React.ReactNode }) {
  return <div className="divide-y divide-black/5">{props.children}</div>;
}

export function FormSection(props: { children: React.ReactNode }) {
  return (
    <div className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
      {props.children}
    </div>
  );
}

export function FormSectionLeft(props: { title: string; description: string }) {
  return (
    <div>
      <SectionHeader>{props.title}</SectionHeader>
      <SectionDescription>{props.description}</SectionDescription>
    </div>
  );
}

export function FormSectionRight(props: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
      {props.children}
    </div>
  );
}
