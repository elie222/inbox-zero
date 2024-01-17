"use client";

import Content from "./content.mdx";
import { LegalPage } from "@/components/LegalPage";

export function TermsContent() {
  return (
    <LegalPage
      date="2023-07-16"
      title="Terms of Service"
      content={<Content />}
    />
  );
}
