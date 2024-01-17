"use client";

import Content from "./content.mdx";
import { LegalPage } from "@/components/LegalPage";

export function PrivacyContent() {
  return (
    <LegalPage date="2023-12-20" title="Privacy Policy" content={<Content />} />
  );
}
