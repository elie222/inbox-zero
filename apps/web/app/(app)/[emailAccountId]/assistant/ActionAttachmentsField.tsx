"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FileTextIcon,
  FolderIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  Loader2Icon,
  HardDriveIcon,
} from "lucide-react";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useDriveSourceItems } from "@/hooks/useDriveSourceItems";
import { useDriveSourceChildren } from "@/hooks/useDriveSourceChildren";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TreeProvider,
  TreeView,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeExpander,
  TreeLabel,
  useTree,
} from "@/components/kibo-ui/tree";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { DriveSourceItem } from "@/app/api/user/drive/source-items/route";

export function ActionAttachmentsField({
  value,
  onChange,
  emailAccountId,
}: {
  value: AttachmentSourceInput[];
  onChange: (value: AttachmentSourceInput[]) => void;
  emailAccountId: string;
}) {
  const { data: connectionsData } = useDriveConnections();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const isConnected = (connectionsData?.connections.length ?? 0) > 0;
  const hasAttachments = value.length > 0;

  const toggleSource = (source: AttachmentSourceInput, checked: boolean) => {
    const key = getSourceKey(source);
    if (checked) {
      onChange(
        [...value, source].filter(
          (item, index, all) =>
            index ===
            all.findIndex(
              (candidate) => getSourceKey(candidate) === getSourceKey(item),
            ),
        ),
      );
    } else {
      onChange(value.filter((item) => getSourceKey(item) !== key));
    }
  };

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2"
          onClick={() => hasAttachments && setIsExpanded(!isExpanded)}
        >
          <span className="text-sm font-medium">Attachments</span>
          {!isConnected && (
            <Badge
              variant="outline"
              className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300"
            >
              Setup needed
            </Badge>
          )}
          {isConnected && hasAttachments && (
            <Badge variant="secondary" className="tabular-nums">
              {value.length}
            </Badge>
          )}
          {isConnected && hasAttachments && (
            <span className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
            </span>
          )}
        </button>
      </div>

      {!isConnected && (
        <div className="mt-2 flex items-start gap-3 rounded-md bg-muted/50 p-3">
          <HardDriveIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Connect Google Drive to attach files to your replies.
            </p>
            <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-sm">
              <Link href={`/${emailAccountId}/drive`}>Connect Drive</Link>
            </Button>
          </div>
        </div>
      )}

      {isConnected && isExpanded && hasAttachments && (
        <div className="mt-2 space-y-1">
          {value.map((source) => (
            <div
              key={getSourceKey(source)}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex items-center gap-2">
                {source.type === AttachmentSourceType.FOLDER ? (
                  <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <span className="block truncate font-medium">{source.name}</span>
                  {source.sourcePath && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {source.sourcePath}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 shrink-0"
                onClick={() => toggleSource(source, false)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {isConnected && (
        <div className="mt-2">
          <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm"
              >
                <PlusIcon className="mr-1 size-3.5" />
                Select from Drive
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Select files to attach</DialogTitle>
              </DialogHeader>
              <AttachmentPicker
                selectedKeys={
                  new Set(value.map((source) => getSourceKey(source)))
                }
                onToggle={toggleSource}
              />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

function AttachmentPicker({
  selectedKeys,
  onToggle,
}: {
  selectedKeys: Set<string>;
  onToggle: (source: AttachmentSourceInput, checked: boolean) => void;
}) {
  const { data, isLoading, error } = useDriveSourceItems(true);

  const rootItems = useMemo(() => {
    const items = data?.items ?? [];
    const itemIds = new Set(items.map((item) => getTreeNodeId(item)));
    return items.filter(
      (item) =>
        !item.parentId ||
        !itemIds.has(`${item.driveConnectionId}:folder:${item.parentId}`),
    );
  }, [data?.items]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {rootItems.length === 0 ? (
        <Empty className="rounded-md border p-6">
          <EmptyHeader>
            <EmptyTitle>No Drive files found</EmptyTitle>
            <EmptyDescription>
              Make sure your Drive connection contains PDF files or folders.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <TreeProvider
          showLines
          showIcons
          selectable={false}
          animateExpand
          indent={16}
        >
          <TreeView className="max-h-[460px] overflow-y-auto p-0">
            {rootItems.map((item, index) => (
              <AttachmentSourceNode
                key={getTreeNodeId(item)}
                item={item}
                isLast={index === rootItems.length - 1}
                level={0}
                selectedKeys={selectedKeys}
                onToggle={onToggle}
              />
            ))}
          </TreeView>
        </TreeProvider>
      )}
    </LoadingContent>
  );
}

function AttachmentSourceNode({
  item,
  isLast,
  level,
  selectedKeys,
  onToggle,
  parentPath = "",
}: {
  item: DriveSourceItem;
  isLast: boolean;
  level: number;
  selectedKeys: Set<string>;
  onToggle: (source: AttachmentSourceInput, checked: boolean) => void;
  parentPath?: string;
}) {
  const { expandedIds } = useTree();
  const nodeId = getTreeNodeId(item);
  const isExpanded = expandedIds.has(nodeId);
  const currentPath = parentPath
    ? `${parentPath}/${item.name}`
    : item.path || item.name;
  const isFolder = item.type === "folder";
  const source = toAttachmentSource(item, currentPath);
  const isSelected = selectedKeys.has(getSourceKey(source));

  const { data, isLoading } = useDriveSourceChildren(
    isFolder && isExpanded
      ? {
          folderId: item.id,
          driveConnectionId: item.driveConnectionId,
        }
      : null,
  );

  const children = data?.items ?? [];

  if (!isFolder) {
    return (
      <TreeNode nodeId={nodeId} level={level} isLast={isLast}>
        <TreeNodeTrigger className="py-1">
          <div className="w-4" />
          <FileTextIcon className="size-4 text-muted-foreground" />
          <div className="flex flex-1 items-center gap-2">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggle(source, checked === true)}
              onClick={(event) => event.stopPropagation()}
            />
            <TreeLabel>{item.name}</TreeLabel>
          </div>
        </TreeNodeTrigger>
      </TreeNode>
    );
  }

  return (
    <TreeNode nodeId={nodeId} level={level} isLast={isLast}>
      <TreeNodeTrigger className="py-1">
        {isLoading ? (
          <div className="mr-1 flex h-4 w-4 items-center justify-center">
            <Loader2Icon className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <TreeExpander hasChildren />
        )}
        <FolderIcon className="size-4 text-muted-foreground" />
        <div className="flex flex-1 items-center gap-2">
          <TreeLabel>{item.name}</TreeLabel>
        </div>
      </TreeNodeTrigger>
      <TreeNodeContent hasChildren={isExpanded}>
        {children.length > 0 ? (
          children.map((child, index) => (
            <AttachmentSourceNode
              key={getTreeNodeId(child)}
              item={child}
              isLast={index === children.length - 1}
              level={level + 1}
              selectedKeys={selectedKeys}
              onToggle={onToggle}
              parentPath={currentPath}
            />
          ))
        ) : isExpanded && !isLoading ? (
          <div
            className="py-1 text-xs italic text-muted-foreground"
            style={{ paddingLeft: (level + 1) * 16 + 28 }}
          >
            No PDFs found
          </div>
        ) : null}
      </TreeNodeContent>
    </TreeNode>
  );
}

function toAttachmentSource(
  item: DriveSourceItem,
  sourcePath: string,
): AttachmentSourceInput {
  return {
    driveConnectionId: item.driveConnectionId,
    name: item.name,
    sourceId: item.id,
    sourcePath,
    type:
      item.type === "folder"
        ? AttachmentSourceType.FOLDER
        : AttachmentSourceType.FILE,
  };
}

function getSourceKey(source: AttachmentSourceInput) {
  return `${source.driveConnectionId}:${source.type}:${source.sourceId}`;
}

function getTreeNodeId(item: DriveSourceItem) {
  return `${item.driveConnectionId}:${item.type}:${item.id}`;
}
