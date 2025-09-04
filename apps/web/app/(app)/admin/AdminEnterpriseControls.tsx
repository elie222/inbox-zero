"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EnterpriseModal } from "./EnterpriseModal";

export const AdminEnterpriseControls = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Enterprise SSO</h3>
        <p className="text-sm text-muted-foreground">
          Configure SAML Single Sign-On for organizations
        </p>
      </div>

      <Button onClick={() => setIsModalOpen(true)}>
        Register SSO Provider
      </Button>

      <EnterpriseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
