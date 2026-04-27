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
  contentSetManually,
  allowAiSelectedSources = true,
  attachmentSources,
  onAttachmentSourcesChange,
}: {
  value: AttachmentSourceInput[];
  onChange: (value: AttachmentSourceInput[]) => void;
  emailAccountId: string;
  contentSetManually: boolean;
  allowAiSelectedSources?: boolean;
  attachmentSources: AttachmentSourceInput[];
  onAttachmentSourcesChange: (value: AttachmentSourceInput[]) => void;
}) {
  const { data: connectionsData } = useDriveConnections();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);

  const isConnected = (connectionsData?.connections.length ?? 0) > 0;
  const hasAttachments = value.length > 0;
  const aiSourceCount = allowAiSelectedSources ? attachmentSources.length : 0;
  const hasAiSources = aiSourceCount > 0;
  const totalCount = value.length + aiSourceCount;

  const selectedKeys = useMemo(
    () => new Set(value.map((source) => getSourceKey(source))),
    [value],
  );

  const aiSourceKeys = useMemo(
    () => new Set(attachmentSources.map((source) => getSourceKey(source))),
    [attachmentSources],
  );

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

  const toggleAiSource = (source: AttachmentSourceInput, checked: boolean) => {
    const key = getSourceKey(source);
    if (checked) {
      onAttachmentSourcesChange(
        [...attachmentSources, source].filter(
          (item, index, all) =>
            index ===
            all.findIndex(
              (candidate) => getSourceKey(candidate) === getSourceKey(item),
            ),
        ),
      );
    } else {
      onAttachmentSourcesChange(
        attachmentSources.filter((item) => getSourceKey(item) !== key),
      );
    }
  };

  return (
    <div className="border-t pt-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Attachments</span>
        {isConnected && totalCount > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {totalCount}
          </Badge>
        )}
      </div>

      {!isConnected && (
        <div className="mt-2 flex items-start gap-3 rounded-md bg-muted/50 p-3">
          <HardDriveIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Connect your cloud storage to attach files to your emails.
            </p>
            <Button
              asChild
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 text-sm"
            >
              <Link href={`/${emailAccountId}/drive`}>Connect Drive</Link>
            </Button>
          </div>
        </div>
      )}

      {isConnected && contentSetManually && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            onClick={() => hasAttachments && setIsExpanded(!isExpanded)}
          >
            <span className="font-medium">Always attach</span>
            {hasAttachments && (
              <>
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {value.length}
                </Badge>
                {isExpanded ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
              </>
            )}
          </button>

          {isExpanded && hasAttachments && (
            <SourceList
              items={value}
              onRemove={(source) => toggleSource(source, false)}
            />
          )}

          <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs mt-1"
              >
                <PlusIcon className="mr-1 size-3" />
                Select files
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Select files to always attach</DialogTitle>
              </DialogHeader>
              <AttachmentPicker
                selectedKeys={selectedKeys}
                onToggle={toggleSource}
                allowFolderSelection={false}
              />
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isConnected && allowAiSelectedSources && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            onClick={() =>
              hasAiSources && setIsSourcesExpanded(!isSourcesExpanded)
            }
          >
            <span className="font-medium">AI-selected sources</span>
            {hasAiSources && (
              <>
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {attachmentSources.length}
                </Badge>
                {isSourcesExpanded ? (
                  <ChevronDownIcon className="size-3" />
                ) : (
                  <ChevronRightIcon className="size-3" />
                )}
              </>
            )}
          </button>

          {isSourcesExpanded && hasAiSources && (
            <SourceList
              items={attachmentSources}
              onRemove={(source) => toggleAiSource(source, false)}
            />
          )}

          <Dialog
            open={isSourcePickerOpen}
            onOpenChange={setIsSourcePickerOpen}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs mt-1"
              >
                <PlusIcon className="mr-1 size-3" />
                Select sources for AI
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Select sources for AI to search</DialogTitle>
              </DialogHeader>
              <AttachmentPicker
                selectedKeys={aiSourceKeys}
                onToggle={toggleAiSource}
                allowFolderSelection
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
  allowFolderSelection = false,
}: {
  selectedKeys: Set<string>;
  onToggle: (source: AttachmentSourceInput, checked: boolean) => void;
  allowFolderSelection?: boolean;
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
                allowFolderSelection={allowFolderSelection}
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
  allowFolderSelection = false,
}: {
  item: DriveSourceItem;
  isLast: boolean;
  level: number;
  selectedKeys: Set<string>;
  onToggle: (source: AttachmentSourceInput, checked: boolean) => void;
  parentPath?: string;
  allowFolderSelection?: boolean;
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
          {allowFolderSelection && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggle(source, checked === true)}
              onClick={(event) => event.stopPropagation()}
            />
          )}
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
              allowFolderSelection={allowFolderSelection}
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

function SourceList({
  items,
  onRemove,
}: {
  items: AttachmentSourceInput[];
  onRemove: (source: AttachmentSourceInput) => void;
}) {
  return (
    <div className="mt-1 space-y-1">
      {items.map((source) => (
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
            onClick={() => onRemove(source)}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
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
