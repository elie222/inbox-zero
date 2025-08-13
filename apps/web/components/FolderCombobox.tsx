import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { cn } from "@/utils";

interface FolderComboboxProps {
  folders: OutlookFolder[];
  isLoading: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
}

export function FolderCombobox({
  folders,
  isLoading,
  value,
  onChangeValue,
  placeholder = "Select a folder...",
}: FolderComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedFolder = folders.find((folder) => folder.id === value);

  const filteredFolders = folders.filter((folder) =>
    folder.displayName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={isLoading}
        >
          {selectedFolder ? selectedFolder.displayName : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="border-0 focus:ring-0"
            />
          </div>
          <CommandList>
            <CommandEmpty>No folder found.</CommandEmpty>
            <CommandGroup>
              {filteredFolders.map((folder) => (
                <CommandItem
                  key={folder.id}
                  value={folder.id}
                  onSelect={(currentValue) => {
                    onChangeValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === folder.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {folder.displayName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
