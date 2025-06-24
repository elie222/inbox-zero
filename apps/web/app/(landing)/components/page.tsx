"use client";

import { SparklesIcon } from "lucide-react";
import { CardBasic } from "@/components/ui/card";
import { Container } from "@/components/Container";
import {
  PageHeading,
  SectionDescription,
  SectionHeader,
  MessageText,
  TypographyP,
  TypographyH3,
  TypographyH4,
  TextLink,
} from "@/components/Typography";
import { Button } from "@/components/Button";
import { Button as ShadButton } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertBasic } from "@/components/Alert";
import { Notice } from "@/components/Notice";
import { TestErrorButton } from "@/app/(landing)/components/TestError";
import { TestActionButton } from "@/app/(landing)/components/TestAction";
import {
  MultiSelectFilter,
  useMultiSelectFilter,
} from "@/components/MultiSelectFilter";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Suspense } from "react";
import { PremiumAiAssistantAlert } from "@/components/PremiumAlert";
import { PremiumTier } from "@prisma/client";

export const maxDuration = 3;

export default function Components() {
  const { selectedValues, setSelectedValues } = useMultiSelectFilter([
    "alerts",
  ]);

  return (
    <Container>
      <div className="space-y-8 py-8">
        <h1>A Storybook style page demoing components we use.</h1>

        <div className="space-y-6">
          <div className="underline">Typography</div>
          <PageHeading>PageHeading</PageHeading>
          <TypographyH3>TypographyH3</TypographyH3>
          <TypographyH4>TypographyH4</TypographyH4>
          <SectionHeader>SectionHeader</SectionHeader>
          <SectionDescription>SectionDescription</SectionDescription>
          <MessageText>MessageText</MessageText>
          <TypographyP>TypographyP</TypographyP>
          <TextLink href="#">TextLink</TextLink>
        </div>

        <div className="space-y-6">
          <div className="underline">Card</div>
          <CardBasic>This is a basic card.</CardBasic>
        </div>

        <div className="space-y-6">
          <div className="underline">Buttons</div>
          <div className="flex flex-wrap gap-2">
            <Button size="xs">Button XS</Button>
            <Button size="sm">Button SM</Button>
            <Button size="md">Button MD</Button>
            <Button size="lg">Button LG</Button>
            <Button size="xl">Button XL</Button>
            <Button size="2xl">Button 2XL</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button color="red">Button Red</Button>
            <Button color="white">Button White</Button>
            <Button color="transparent">Button Transparent</Button>
            <Button loading>Button Loading</Button>
            <Button disabled>Button Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShadButton variant="default">ShadButton Default</ShadButton>
            <ShadButton variant="secondary">ShadButton Secondary</ShadButton>
            <ShadButton variant="outline">ShadButton Outline</ShadButton>
            <ShadButton variant="outline" loading>
              ShadButton Loading
            </ShadButton>
            <ShadButton variant="ghost">ShadButton Ghost</ShadButton>
            <ShadButton variant="destructive">
              ShadButton Destructive
            </ShadButton>
            <ShadButton variant="link">ShadButton Link</ShadButton>
            <ShadButton variant="green">ShadButton Green</ShadButton>
            <ShadButton variant="red">ShadButton Red</ShadButton>
            <ShadButton variant="blue">ShadButton Blue</ShadButton>
            <ShadButton variant="primaryBlue">
              ShadButton Primary Blue
            </ShadButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <ShadButton size="xs">ShadButton XS</ShadButton>
            <ShadButton size="sm">ShadButton SM</ShadButton>
            <ShadButton size="lg">ShadButton LG</ShadButton>
            <ShadButton size="icon">
              <SparklesIcon className="size-4" />
            </ShadButton>
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
            <Suspense>
              <Tabs defaultValue="account" className="w-[400px]">
                <TabsList>
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="password">Password</TabsTrigger>
                </TabsList>
                <TabsContent value="account">Account content</TabsContent>
                <TabsContent value="password">Password content</TabsContent>
              </Tabs>
            </Suspense>
          </div>
        </div>

        <div>
          <div className="underline">Alerts</div>
          <div className="mt-4 space-y-2">
            <AlertBasic
              title="Alert title default"
              description="Alert description"
              variant="default"
            />
            <AlertBasic
              title="Alert title success"
              description="Alert description"
              variant="success"
            />
            <AlertBasic
              title="Alert title destructive"
              description="Alert description"
              variant="destructive"
            />
            <AlertBasic
              title="Alert title blue"
              description="Alert description"
              variant="blue"
            />
          </div>
        </div>

        <div>
          <div className="underline">Notices</div>
          <div className="mt-4 space-y-2">
            <Notice variant="info">
              <strong>Info:</strong> This is an informational notice with some
              helpful context.
            </Notice>
            <Notice variant="warning">
              <strong>Warning:</strong> Please be cautious when proceeding with
              this action.
            </Notice>
            <Notice variant="success">
              <strong>Success:</strong> Your changes have been saved
              successfully!
            </Notice>
            <Notice variant="error">
              <strong>Error:</strong> Something went wrong. Please try again.
            </Notice>
          </div>
        </div>

        <div>
          <div className="underline">TooltipExplanation</div>
          <div className="mt-4 flex flex-col gap-2">
            <TooltipExplanation size="sm" text="Sm explanation tooltip" />
            <TooltipExplanation size="md" text="Md explanation tooltip" />
          </div>
        </div>

        <div>
          <div className="underline">Premium Alerts</div>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Basic Plan (needs upgrade to Business):
              </p>
              <PremiumAiAssistantAlert
                showSetApiKey={false}
                tier={PremiumTier.BASIC_MONTHLY}
              />
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Pro Plan (needs API key):
              </p>
              <PremiumAiAssistantAlert
                showSetApiKey={true}
                tier={PremiumTier.PRO_MONTHLY}
              />
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Free Plan (needs upgrade):
              </p>
              <PremiumAiAssistantAlert showSetApiKey={false} tier={null} />
            </div>
          </div>
        </div>

        <div>
          <div className="underline">MultiSelectFilter</div>
          <div className="mt-4">
            <MultiSelectFilter
              title="Categories"
              options={[
                { label: "Receipts", value: "receipts" },
                { label: "Newsletters", value: "newsletters" },
                { label: "Updates", value: "updates" },
                { label: "Alerts", value: "alerts" },
              ]}
              selectedValues={selectedValues}
              setSelectedValues={setSelectedValues}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <TestErrorButton />
          <TestActionButton />
        </div>
      </div>
    </Container>
  );
}
