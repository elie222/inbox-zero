"use client";

import { useState } from "react";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { Button } from "@/components/ui/button";
import { EnterpriseModal } from "./EnterpriseModal";

export function EnterpriseSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <FormSection>
        <FormSectionLeft
          title="Enterprise"
          description="Enable Single Sign-On (SSO) and register your organization for enterprise features. Configure your identity provider to allow team members to sign in securely."
        />

        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsModalOpen(true)}
          >
            Configure SSO
          </Button>
        </div>
      </FormSection>

      <EnterpriseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
