"use client";

import { CameraIcon, SendIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  scanBusinessCardAction,
  updateContactAction,
} from "@/utils/actions/contact";
import { sendMyCardAction } from "@/utils/actions/contact-card";
import type { CompanySummary } from "@/utils/contacts";
import { getActionErrorMessage } from "@/utils/error";
import { readImageAsDownscaledDataUrl } from "./business-card-image";

type ContactForm = {
  email: string;
  name: string;
  companyName: string;
  title: string;
  phone: string;
};

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
  const [isReadingCard, setIsReadingCard] = useState(false);
  // Set after a save so the card they just scanned can be answered with yours
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, getValues } =
    useForm<ContactForm>({
      defaultValues: {
        email: "",
        name: "",
        companyName: "",
        title: "",
        phone: "",
      },
    });

  const closeAndReset = () => {
    reset();
    setIsPersonal(false);
    setSavedEmail(null);
    onClose();
  };

  const scan = useAction(scanBusinessCardAction.bind(null, emailAccountId), {
    onSuccess: ({ data }) => {
      if (!data) return;

      // Fill what the card had and leave the rest for the user — nothing
      // saves until they submit
      if (data.name) setValue("name", data.name);
      if (data.title) setValue("title", data.title);
      if (data.companyName) setValue("companyName", data.companyName);
      if (data.email) setValue("email", data.email);
      if (data.phones[0]) setValue("phone", data.phones[0].value);

      toastSuccess({ description: "Card read — check the details below" });
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const add = useAction(updateContactAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Contact added" });
      mutateContacts();
      // Keep the dialog open on the share step; the email is the only field
      // needed to send them your card
      const email = getValues("email").trim();
      if (email) {
        setSavedEmail(email);
      } else {
        closeAndReset();
      }
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const sendMyCard = useAction(sendMyCardAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Your card is on its way" });
      closeAndReset();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const onPickCard = async (file: File | undefined) => {
    if (!file) return;
    setIsReadingCard(true);
    try {
      const imageDataUrl = await readImageAsDownscaledDataUrl(file);
      scan.execute({ imageDataUrl });
    } catch {
      toastError({ description: "Couldn't read that image — try again" });
    } finally {
      setIsReadingCard(false);
      // Allow re-picking the same file
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeAndReset()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {savedEmail ? "Share your card back" : "Add contact"}
          </DialogTitle>
        </DialogHeader>

        {savedEmail ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send {savedEmail} a link to your own card so they have your
              details too.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeAndReset}>
                Not now
              </Button>
              <Button
                loading={sendMyCard.isExecuting}
                onClick={() =>
                  sendMyCard.execute({
                    to: savedEmail,
                    recipientName: getValues("name").trim() || undefined,
                  })
                }
              >
                <SendIcon className="mr-1.5 size-3.5" />
                Send my card
              </Button>
            </div>
          </div>
        ) : (
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
                phones: values.phone.trim()
                  ? [{ label: "Mobile", value: values.phone.trim() }]
                  : undefined,
                companyName: isPersonal
                  ? ""
                  : values.companyName.trim() || undefined,
                isPersonal,
              }),
            )}
          >
            <div className="rounded-lg border border-dashed border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Scan a business card</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Take a photo and we'll fill in the fields.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={isReadingCard || scan.isExecuting}
                  onClick={() => fileInput.current?.click()}
                >
                  <CameraIcon className="mr-1.5 size-3.5" />
                  Scan
                </Button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => onPickCard(event.target.files?.[0])}
              />
            </div>

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
              <Button type="button" variant="outline" onClick={closeAndReset}>
                Cancel
              </Button>
              <Button type="submit" loading={add.isExecuting}>
                Add contact
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
