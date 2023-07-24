import { Container } from "@/components/Container";
import {
  PageHeading,
  SectionDescription,
  SectionHeader,
} from "@/components/Typography";

export default function Components(props: {}) {
  return (
    <Container>
      <div className="space-y-8 py-8">
        <h1>A Storybook style page demoing components we use.</h1>

        <div className="space-y-6">
          <div className="underline">Typography</div>
          <PageHeading>PageHeading</PageHeading>
          <SectionHeader>SectionHeader</SectionHeader>
          <SectionDescription>SectionDescription</SectionDescription>
        </div>
      </div>
    </Container>
  );
}
