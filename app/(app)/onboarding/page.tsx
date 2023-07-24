"use client";

import { Card } from "@tremor/react";
import { Container } from "@/components/Container";
import { Button } from "@/components/Button";
import { PageHeading, SectionDescription } from "@/components/Typography";
import { LabelItem } from "@/app/(app)/settings/LabelsSection";
import { SubmitButtonWrapper } from "@/components/Form";

const RECOMMENDED_LABELS = [
  "Newsletter",
  "Receipt",
  "Calendar",
  "Privacy policy update",
  "Discount offering",
];
const OTHER_POTENTIAL_LABELS = [
  "Server Down",
  "Recruitment",
  "Investment Opportunity",
  "Support",
  "Sales",
  "Marketing",
  "Product",
  "Feedback",
  "Bug",
  "Feature Request",
  "Complaint",
  "Praise",
  "Refund",
  "Cancellation",
  "Payment",
  "Invoice",
  "Reminder",
  "Meeting",
  "Event",
  "Webinar",
];

// Send our ai the last 500 threads and have it return categories that are helpful

export default function Onboarding() {
  return (
    <Container>
      <div className="py-8">
        <Card>
          <PageHeading>Onboarding</PageHeading>
          <div className="mt-2 max-w-prose">
            <SectionDescription>
              Inbox Zero categorises each email to plan the right course of
              action. Here are the default categories we use but you can adjust
              these in the settings page. To get the most out of Inbox Zero,
              having the right categories is key. And you can improve it by
              adjusting your categories and their descriptions.
            </SectionDescription>
          </div>

          <div className="mt-4">
            {RECOMMENDED_LABELS.map((label) => (
              <LabelItem
                key={label}
                label={{ id: label, name: label }}
                register={() => {}}
                watch={() => {}}
                setValue={() => {}}
                errors={{}}
              />
            ))}

            <SubmitButtonWrapper>
              <div className="ml-auto">
                <Button>Next</Button>
              </div>
            </SubmitButtonWrapper>
          </div>
        </Card>
      </div>
    </Container>
  );
}
