import { Card } from "@tremor/react";
import { Container } from "@/components/Container";
import {
  PageHeading,
  SectionDescription,
  SectionHeader,
} from "@/components/Typography";
import { Button } from "@/components/Button";

export default function Components() {
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

        <div className="space-y-6">
          <div className="underline">Card</div>
          <Card>This is a card. From @tremor/react.</Card>
        </div>

        <div className="space-y-6">
          <div className="underline">Buttons</div>
          <div className="space-x-4">
            <Button size="xs">Button XS</Button>
            <Button size="sm">Button SM</Button>
            <Button size="md">Button MD</Button>
            <Button size="lg">Button LG</Button>
            <Button size="xl">Button XL</Button>
            <Button size="2xl">Button 2XL</Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
