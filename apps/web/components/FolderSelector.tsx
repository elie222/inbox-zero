import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  FolderIcon,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/utils";
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
import { FOLDER_SEPARATOR, type OutlookFolder } from "@/utils/outlook/folders";
import type { FieldError } from "react-hook-form";

interface FolderItemProps {
  folder: OutlookFolder;
  level: number;
  value: { name: string; id: string };
  onSelect: (folderId: string) => void;
  displayPath?: string;
}

function FolderItem({
  folder,
  level,
  value,
  onSelect,
  displayPath,
}: FolderItemProps) {
  return (
    <div key={folder.id}>
      <CommandItem
        key={`${folder.id}-${level}`}
        value={folder.id}
        onSelect={() => onSelect(folder.id)}
        data-folder-id={folder.id}
        data-level={level}
      >
        <Check
          className={cn(
            "mr-2 h-4 w-4",
            value.id === folder.id ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="flex items-center gap-2">
          {level > 0 &&
            Array.from({ length: level }, (_, i) => (
              <ChevronRight key={i} className="h-3 w-3 text-muted-foreground" />
            ))}
          <FolderIcon className="h-4 w-4" />
          <span>{displayPath || folder.displayName}</span>
        </div>
      </CommandItem>
      {folder.childFolders?.map((child) => (
        <div key={child.id} className={""}>
          <FolderItem
            folder={child}
            level={level + 1}
            value={value}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  );
}

interface FolderSelectorProps {
  folders: OutlookFolder[];
  isLoading: boolean;
  value: { name: string; id: string };
  onChangeValue: (value: { name: string; id: string }) => void;
  placeholder?: string;
  error?: FieldError;
}

export function FolderSelector({
  folders,
  isLoading,
  value,
  onChangeValue,
  placeholder = "Select a folder...",
  error,
}: FolderSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const findFolderById = (
    folderList: OutlookFolder[],
    targetId: string,
  ): OutlookFolder | null => {
    for (const folder of folderList) {
      if (folder.id === targetId) {
        return folder;
      }
      if (folder.childFolders && folder.childFolders.length > 0) {
        const found = findFolderById(folder.childFolders, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  const currentFolderId = value.id;
  const selectedFolder = currentFolderId
    ? findFolderById(folders, currentFolderId)
    : null;

  const filteredFolders =
    searchQuery.trim() === ""
      ? folders.map((folder) => ({ folder, displayPath: folder.displayName }))
      : filterFoldersRecursively(folders, searchQuery.toLowerCase());

  function filterFoldersRecursively(
    folderList: OutlookFolder[],
    query: string,
    parentPath = "",
  ): { folder: OutlookFolder; displayPath: string }[] {
    const results: { folder: OutlookFolder; displayPath: string }[] = [];

    for (const folder of folderList) {
      const currentPath = parentPath
        ? `${parentPath}${FOLDER_SEPARATOR}${folder.displayName}`
        : folder.displayName;
      if (folder.displayName.toLowerCase().includes(query)) {
        results.push({ folder, displayPath: currentPath });
      }
      if (folder.childFolders && folder.childFolders.length > 0) {
        const childResults = filterFoldersRecursively(
          folder.childFolders,
          query,
          currentPath,
        );
        results.push(...childResults);
      }
    }

    return results;
  }

  const buildFolderPath = (folderId: string): string => {
    const folder = findFolderById(folders, folderId);
    if (!folder) return "";

    const findPath = (
      folderList: OutlookFolder[],
      targetId: string,
      currentPath: string[] = [],
    ): string[] | null => {
      for (const f of folderList) {
        const newPath = [...currentPath, f.displayName];

        if (f.id === targetId) {
          return newPath;
        }

        if (f.childFolders && f.childFolders.length > 0) {
          const result = findPath(f.childFolders, targetId, newPath);
          if (result) return result;
        }
      }
      return null;
    };

    const pathParts = findPath(folders, folderId);
    return pathParts ? pathParts.join(FOLDER_SEPARATOR) : folder.displayName;
  };

  const handleFolderSelect = (folderId: string) => {
    const folder = findFolderById(folders, folderId);
    if (folder) {
      const fullPath = buildFolderPath(folderId);
      onChangeValue({
        name: fullPath,
        id: folder.id,
      });
      setOpen(false);
    }
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading folders...</span>
                </>
              ) : selectedFolder?.displayName ? (
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4" />
                  <span>{value.name || selectedFolder?.displayName || ""}</span>
                </div>
              ) : (
                placeholder
              )}
            </div>
            <div className="flex items-center gap-1">
              {selectedFolder?.displayName && !isLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeValue({ name: "", id: "" });
                  }}
                  title="Clear folder selection"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput
              placeholder="Search folders..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Loading folders...</span>
                </div>
              ) : (
                <>
                  <CommandEmpty>No folder found.</CommandEmpty>
                  <CommandGroup>
                    {filteredFolders.map(({ folder, displayPath }) => {
                      return (
                        <FolderItem
                          key={folder.id}
                          folder={folder}
                          level={0}
                          value={value}
                          onSelect={handleFolderSelect}
                          displayPath={displayPath}
                        />
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <div className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error.message}
        </div>
      )}
    </div>
  );
}
