import { Toaster as SonnerToaster, toast } from "sonner";

export function toastSuccess(options: { title?: string; description: string }) {
  return toast.success(options.title || "Success", {
    description: options.description,
  });
}

export function toastError(options: { title?: string; description: string }) {
  return toast.error(options.title || "Error", {
    description: options.description,
  });
}

export function toastInfo(options: { description: string }) {
  return toast(options.description);
}

export const Toaster = SonnerToaster;
