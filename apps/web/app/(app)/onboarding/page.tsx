"use client";

import { Card } from "@/components/Card";
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
              Inbox Zero categorizes emails to plan the right action. You can
              customize categories in the settings to improve results.
            </SectionDescription>
          </div>

          <div className="mt-4">
            <div className="grid grid-cols-4 items-center gap-x-4 gap-y-6">
              <div className="">Category</div>
              <div className="col-span-3 flex items-center space-x-2">
                <div className="">Enabled</div>
                <div className="">Description</div>
              </div>
            </div>
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
