"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  getAttachmentSourceKey,
  type AttachmentSourceInput,
} from "@/utils/attachments/source-schema";
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
  DialogDescription,
  DialogFooter,
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
import type { DriveSourceItem } from "@/utils/drive/source-items";
import {
  applyAttachmentSourceSelection,
  buildDriveSourceChildrenMap,
  driveSourceSelection,
  getAttachmentSourceNodeSelection,
  getDriveSourceTreeNodeId,
  type DriveSourceChildrenMap,
} from "./attachment-source-selection";

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
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);

  const isConnected = (connectionsData?.connections.length ?? 0) > 0;
  const hasAttachments = value.length > 0;
  const aiSourceCount = allowAiSelectedSources ? attachmentSources.length : 0;
  const hasAiSources = aiSourceCount > 0;
  const totalCount = value.length + aiSourceCount;

  const removeSource = (source: AttachmentSourceInput) => {
    onChange(removeSelectedSource(value, source));
  };

  const removeAiSource = (source: AttachmentSourceInput) => {
    onAttachmentSourcesChange(removeSelectedSource(attachmentSources, source));
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
            <SourceList items={value} onRemove={removeSource} />
          )}

          <AttachmentSourcePickerDialog
            value={value}
            onChange={onChange}
            triggerLabel="Select files"
            title="Select files to always attach"
            description="Choose files that this rule should always attach after you save."
            allowFolderSelection={false}
          />
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
            <SourceList items={attachmentSources} onRemove={removeAiSource} />
          )}

          <AttachmentSourcePickerDialog
            value={attachmentSources}
            onChange={onAttachmentSourcesChange}
            triggerLabel="Select sources for AI"
            title="Select sources for AI to search"
            description="Choose files or folders the AI can search after you save."
            allowFolderSelection
          />
        </div>
      )}
    </div>
  );
}

function AttachmentSourcePickerDialog({
  value,
  onChange,
  triggerLabel,
  title,
  description,
  allowFolderSelection = false,
}: {
  value: AttachmentSourceInput[];
  onChange: (value: AttachmentSourceInput[]) => void;
  triggerLabel: string;
  title: string;
  description: string;
  allowFolderSelection?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftSources, setDraftSources] = useState(value);

  const openPicker = () => {
    setDraftSources(value);
    setIsOpen(true);
  };

  const cancelPicker = () => {
    setDraftSources(value);
    setIsOpen(false);
  };

  const savePicker = () => {
    onChange(draftSources);
    setIsOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => (open ? openPicker() : cancelPicker())}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs mt-1"
        >
          <PlusIcon className="mr-1 size-3" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        </DialogHeader>
        <AttachmentPicker
          selectedSources={draftSources}
          onSelectedSourcesChange={setDraftSources}
          allowFolderSelection={allowFolderSelection}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancelPicker}>
            Cancel
          </Button>
          <Button type="button" onClick={savePicker}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentPicker({
  selectedSources,
  onSelectedSourcesChange,
  allowFolderSelection = false,
}: {
  selectedSources: AttachmentSourceInput[];
  onSelectedSourcesChange: (sources: AttachmentSourceInput[]) => void;
  allowFolderSelection?: boolean;
}) {
  const { data, isLoading, error } = useDriveSourceItems(true);
  const items = data?.items;
  const selectedKeys = useMemo(
    () =>
      new Set(selectedSources.map((source) => getAttachmentSourceKey(source))),
    [selectedSources],
  );
  const [loadedChildren, setLoadedChildren] = useState<DriveSourceChildrenMap>(
    () => new Map(),
  );

  const childrenByParentId = useMemo(() => {
    const map = buildDriveSourceChildrenMap(items ?? []);
    for (const [parentId, children] of loadedChildren) {
      map.set(parentId, children);
    }
    return map;
  }, [items, loadedChildren]);

  const rootItems = useMemo(
    () => driveSourceSelection.getRootItems(items ?? []),
    [items],
  );

  const handleChildrenLoaded = useCallback(
    (parentId: string, children: DriveSourceItem[]) => {
      setLoadedChildren((current) => {
        if (current.has(parentId)) return current;
        return new Map(current).set(parentId, children);
      });
    },
    [],
  );

  const handleToggle = (item: DriveSourceItem, checked: boolean) => {
    onSelectedSourcesChange(
      applyAttachmentSourceSelection({
        item,
        checked,
        selectedSources,
      }),
    );
  };

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
                key={getDriveSourceTreeNodeId(item)}
                item={item}
                isLast={index === rootItems.length - 1}
                level={0}
                selectedKeys={selectedKeys}
                onToggle={handleToggle}
                onChildrenLoaded={handleChildrenLoaded}
                childrenByParentId={childrenByParentId}
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
  onChildrenLoaded,
  childrenByParentId,
  ancestorFolderSelected = false,
  allowFolderSelection = false,
}: {
  item: DriveSourceItem;
  isLast: boolean;
  level: number;
  selectedKeys: Set<string>;
  onToggle: (item: DriveSourceItem, checked: boolean) => void;
  onChildrenLoaded: (parentId: string, children: DriveSourceItem[]) => void;
  childrenByParentId: DriveSourceChildrenMap;
  ancestorFolderSelected?: boolean;
  allowFolderSelection?: boolean;
}) {
  const { expandedIds } = useTree();
  const nodeId = getDriveSourceTreeNodeId(item);
  const isExpanded = expandedIds.has(nodeId);
  const isFolder = item.type === "folder";
  const { checkboxState, isSelectionInherited, descendantsAreSelected } =
    getAttachmentSourceNodeSelection({
      item,
      selectedKeys,
      childrenByParentId,
      ancestorFolderSelected,
    });

  const knownChildren = childrenByParentId.get(nodeId);
  const { data, isLoading } = useDriveSourceChildren(
    isFolder && isExpanded && !knownChildren
      ? {
          folderId: item.id,
          driveConnectionId: item.driveConnectionId,
        }
      : null,
  );

  const children = useMemo(
    () =>
      knownChildren ??
      (data?.items ?? []).map((child) => ({
        ...child,
        parentId: item.id,
        path: `${item.path || item.name}/${child.name}`,
      })),
    [knownChildren, data?.items, item],
  );

  useEffect(() => {
    if (!data?.items || knownChildren) return;
    onChildrenLoaded(nodeId, children);
  }, [children, data?.items, knownChildren, nodeId, onChildrenLoaded]);

  if (!isFolder) {
    return (
      <TreeNode nodeId={nodeId} level={level} isLast={isLast}>
        <TreeNodeTrigger className="py-1">
          <div className="w-4" />
          <FileTextIcon className="size-4 text-muted-foreground" />
          <div className="flex flex-1 items-center gap-2">
            <Checkbox
              checked={checkboxState}
              disabled={isSelectionInherited}
              onCheckedChange={(checked) => onToggle(item, checked === true)}
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
              checked={checkboxState}
              disabled={isSelectionInherited}
              onCheckedChange={(checked) => onToggle(item, checked === true)}
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
              key={getDriveSourceTreeNodeId(child)}
              item={child}
              isLast={index === children.length - 1}
              level={level + 1}
              selectedKeys={selectedKeys}
              onToggle={onToggle}
              onChildrenLoaded={onChildrenLoaded}
              childrenByParentId={childrenByParentId}
              ancestorFolderSelected={descendantsAreSelected}
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
          key={getAttachmentSourceKey(source)}
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

function removeSelectedSource(
  sources: AttachmentSourceInput[],
  source: AttachmentSourceInput,
) {
  const key = getAttachmentSourceKey(source);
  return sources.filter((item) => getAttachmentSourceKey(item) !== key);
}
