import { Card } from "@/components/Card";
import { Container } from "@/components/Container";
import {
  PageHeading,
  SectionDescription,
  SectionHeader,
  MessageText,
  TypographyP,
  TypographyH3,
} from "@/components/Typography";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Components() {
  return (
    <Container>
      <div className="space-y-8 py-8">
        <h1>A Storybook style page demoing components we use.</h1>

        <div className="space-y-6">
          <div className="underline">Typography</div>
          <PageHeading>PageHeading</PageHeading>
          <TypographyH3>TypographyH3</TypographyH3>
          <SectionHeader>SectionHeader</SectionHeader>
          <SectionDescription>SectionDescription</SectionDescription>
          <MessageText>MessageText</MessageText>
          <TypographyP>TypographyP</TypographyP>
        </div>

        <div className="space-y-6">
          <div className="underline">Card</div>
          <Card>This is a card.</Card>
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
          <div className="space-x-4">
            <Button color="red">Button Red</Button>
            <Button color="white">Button White</Button>
            <Button color="transparent">Button Transparent</Button>
            <Button loading>Button Loading</Button>
            <Button disabled>Button Disabled</Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="underline">Badges</div>
          <div className="space-x-4">
            <Badge color="red">Red</Badge>
            <Badge color="yellow">Yellow</Badge>
            <Badge color="green">Green</Badge>
            <Badge color="blue">Blue</Badge>
            <Badge color="indigo">Indigo</Badge>
            <Badge color="purple">Purple</Badge>
            <Badge color="pink">Pink</Badge>
            <Badge color="gray">Gray</Badge>
          </div>
        </div>

        <div>
          <div className="underline">Tabs</div>
          <div className="mt-4">
            <Tabs defaultValue="account" className="w-[400px]">
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
              </TabsList>
              <TabsContent value="account">Account content</TabsContent>
              <TabsContent value="password">Password content</TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </Container>
  );
}
