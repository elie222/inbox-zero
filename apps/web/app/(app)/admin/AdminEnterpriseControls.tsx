"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RegisterSSOModal } from "./RegisterSSOModal";

export const AdminEnterpriseControls = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Button onClick={() => setIsModalOpen(true)}>
        Register SSO Provider
      </Button>

      <RegisterSSOModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
