"use client";

import { useForm } from "react-hook-form";
import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import type { CompanySummary } from "@/utils/contacts";
import { updateContactAction } from "@/utils/actions/contact";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AddContactDialog({
  open,
  onClose,
  companies,
  mutateContacts,
}: {
  open: boolean;
  onClose: () => void;
  // Existing companies feed the company field's type-ahead
  companies: CompanySummary[];
  mutateContacts: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [isPersonal, setIsPersonal] = useState(false);

  const { register, handleSubmit, reset } = useForm<{
    email: string;
    name: string;
    companyName: string;
    title: string;
    phone: string;
  }>({
    defaultValues: {
      email: "",
      name: "",
      companyName: "",
      title: "",
      phone: "",
    },
  });

  const add = useAction(updateContactAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Contact added" });
      mutateContacts();
      reset();
      setIsPersonal(false);
      onClose();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((values) =>
            // This calls the create-or-update upsert, so a blank field must
            // be omitted (undefined), not sent as "" — otherwise re-adding an
            // already-saved contact would wipe their name/title/phone/company
            // (and push that wipe to Google). Personal still clears company.
            add.execute({
              email: values.email.trim(),
              name: values.name.trim() || undefined,
              title: values.title.trim() || undefined,
              phone: values.phone.trim() || undefined,
              companyName: isPersonal
                ? ""
                : values.companyName.trim() || undefined,
              isPersonal,
            }),
          )}
        >
          <div>
            <Label htmlFor="add-email">Email</Label>
            <Input
              id="add-email"
              type="email"
              required
              className="mt-2"
              placeholder="person@company.com"
              {...register("email")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" className="mt-2" {...register("name")} />
            </div>
            <div>
              <Label htmlFor="add-title">Title</Label>
              <Input id="add-title" className="mt-2" {...register("title")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="add-company">Company</Label>
              <Input
                id="add-company"
                className="mt-2"
                disabled={isPersonal}
                placeholder="Pick or type a new one"
                list="add-company-options"
                {...register("companyName")}
              />
              <datalist id="add-company-options">
                {companies.map((option) => (
                  <option key={option.id} value={option.name} />
                ))}
              </datalist>
            </div>
            <div>
              <Label htmlFor="add-phone">Phone</Label>
              <Input id="add-phone" className="mt-2" {...register("phone")} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="add-personal">Personal contact</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Grouped under Personal instead of a company.
              </p>
            </div>
            <Switch
              id="add-personal"
              checked={isPersonal}
              onCheckedChange={setIsPersonal}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={add.isExecuting}>
              Add contact
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
