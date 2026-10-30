import { SignatureIcon } from "lucide-react";
import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ComposeSignaturePicker({
  signatures,
  selectedId,
  disabled,
  onSelect,
}: {
  signatures: GetSignatureResponse["signatures"];
  selectedId?: string;
  disabled: boolean;
  onSelect: (signature: GetSignatureResponse["signatures"][number]) => void;
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
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signature</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selectedId ?? ""}
          onValueChange={(id) => {
            const signature = signatures.find((item) => item.id === id);
            if (signature) onSelect(signature);
          }}
        >
          {signatures.map((signature) => (
            <DropdownMenuRadioItem key={signature.id} value={signature.id}>
              {signature.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
