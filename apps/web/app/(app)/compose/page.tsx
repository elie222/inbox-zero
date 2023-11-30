import React from "react";
import { PageHeading } from "@/components/Typography";
import { ComposeEmailForm } from "@/app/(app)/compose/ComposeEmailForm";

export default function ComposePage() {
  return (
    <div className="container mx-auto mt-10 px-4 sm:px-6 lg:px-8">
      <PageHeading>Send Email</PageHeading>

      <div className="mt-6">
        <ComposeEmailForm />
      </div>
    </div>
  );
}
