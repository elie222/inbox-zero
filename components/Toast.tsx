import { Toaster as SonnerToaster, toast } from "sonner";

export function toastSuccess(options: { description: string }) {
  return toast.success("Success", { description: options.description });
}

export function toastError(options: { description: string }) {
  return toast.error("Error", { description: options.description });
}

export const Toaster = SonnerToaster;
