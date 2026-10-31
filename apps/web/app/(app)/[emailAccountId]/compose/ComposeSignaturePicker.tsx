import { CheckIcon, SignatureIcon } from "lucide-react";
import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Signature = GetSignatureResponse["signatures"][number];

export function ComposeSignaturePicker({
  signatures,
  selectedId,
  disabled,
  onSelect,
}: {
  signatures: Signature[];
  selectedId?: string;
  disabled: boolean;
  onSelect: (signature: Signature) => void;
}) {
  if (signatures.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Choose signature"
          className="hover:bg-transparent"
          disabled={disabled}
          size="icon"
          type="button"
          variant="ghostMuted"
        >
          <SignatureIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {signatures.map((signature) => (
          <DropdownMenuItem
            className="gap-3"
            key={signature.id}
            onSelect={() => onSelect(signature)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {signature.name}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {getSignatureText(signature.signatureHtml)}
              </span>
            </span>
            {signature.id === selectedId && (
              <CheckIcon
                aria-label="Current signature"
                className="size-4 shrink-0"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getSignatureText(html: string) {
  const spaced = html.replace(/<(br|\/div|\/p|\/li|\/tr)\b[^>]*>/gi, "$& ");
  const text = new DOMParser().parseFromString(spaced, "text/html").body
    .textContent;
  return (text ?? "").replace(/\s+/g, " ").trim();
}
