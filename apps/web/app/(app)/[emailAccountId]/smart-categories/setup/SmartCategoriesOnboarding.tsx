"use client";

import { Trans } from "@lingui/react/macro";
import { useOnboarding } from "@/components/OnboardingModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CardBasic } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TagsIcon, ArchiveIcon, ZapIcon } from "lucide-react";

export function SmartCategoriesOnboarding() {
  const { isOpen, setIsOpen, onClose } = useOnboarding("SmartCategories");

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Welcome to Sender Categories</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Automatically categorize who emails you for better inbox
              management and smarter automation.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:gap-4">
          <CardBasic className="flex items-center">
            <TagsIcon className="mr-3 h-5 w-5" />
            <Trans>Auto-categorize who emails you</Trans>
          </CardBasic>
          <CardBasic className="flex items-center">
            <ArchiveIcon className="mr-3 h-5 w-5" />
            <Trans>Bulk archive by category</Trans>
          </CardBasic>
          <CardBasic className="flex items-center">
            <ZapIcon className="mr-3 h-5 w-5" />
            <Trans>Use categories to optimize the AI assistant</Trans>
          </CardBasic>
        </div>
        <div>
          <Button className="w-full" onClick={onClose}>
            <Trans>Get Started</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
