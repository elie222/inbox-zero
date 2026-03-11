"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
  PlusIcon,
  CrownIcon,
} from "lucide-react";
import { AttachmentSourceType } from "@/generated/prisma/enums";
import type { AttachmentSourceInput } from "@/utils/attachments/source-schema";
import { useDriveSourceItems } from "@/hooks/useDriveSourceItems";
import { useDriveSourceChildren } from "@/hooks/useDriveSourceChildren";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { usePremium } from "@/components/PremiumAlert";
import { hasTierAccess } from "@/utils/premium";
import { AlertWithButton } from "@/components/Alert";
import type { DriveSourceItem } from "@/app/api/user/drive/source-items/route";

export function AttachmentSourcesField({
  value,
  onChange,
}: {
  value: AttachmentSourceInput[];
  onChange: (value: AttachmentSourceInput[]) => void;
}) {
  const { tier } = usePremium();
  const [isOpen, setIsOpen] = useState(false);
  const hasAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "PLUS_MONTHLY",
  });
  const { data, isLoading, error } = useDriveSourceItems(isOpen);

  const selectedKeys = useMemo(
    () => new Set(value.map((source) => getSourceKey(source))),
    [value],
  );

  const rootItems = useMemo(() => {
    const items = data?.items ?? [];
    const itemIds = new Set(items.map((item) => getTreeNodeId(item)));
    return items.filter(
      (item) =>
        !item.parentId ||
        !itemIds.has(`${item.driveConnectionId}:folder:${item.parentId}`),
    );
  }, [data?.items]);

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
      return;
    }

    onChange(value.filter((item) => getSourceKey(item) !== key));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft attachments</CardTitle>
        <CardDescription>
          AI can search these approved drive files and folders when drafting
          replies for this rule.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAccess && (
          <AlertWithButton
            title="Upgrade to enable draft attachments"
            description="Drive-powered draft attachments require the Plus plan or higher."
            icon={<CrownIcon className="h-4 w-4" />}
            button={
              <Button asChild>
                <Link href="/premium">Upgrade</Link>
              </Button>
            }
            variant="blue"
          />
        )}

        {value.length > 0 ? (
          <div className="space-y-2">
            {value.map((source) => (
              <div
                key={getSourceKey(source)}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {source.type === AttachmentSourceType.FOLDER ? (
                      <FolderIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <FileTextIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className="truncate">{source.name}</span>
                  </div>
                  {source.sourcePath && (
                    <div className="truncate text-xs text-muted-foreground">
                      {source.sourcePath}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSource(source, false)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty className="border rounded-md p-6">
            <EmptyHeader>
              <EmptyTitle>No attachment sources selected</EmptyTitle>
              <EmptyDescription>
                Pick files or folders from Drive. The AI will only search within
                these approved sources.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={!hasAccess}>
              <PlusIcon className="mr-2 size-4" />
              Select from Drive
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Select Drive sources</DialogTitle>
            </DialogHeader>
            <LoadingContent loading={isLoading} error={error}>
              <TreeProvider
                showLines
                showIcons
                selectable={false}
                animateExpand
                indent={16}
              >
                <TreeView className="max-h-[460px] overflow-y-auto p-0">
                  {rootItems.map((item, index) => (
                    <SourceNode
                      key={getTreeNodeId(item)}
                      item={item}
                      isLast={index === rootItems.length - 1}
                      level={0}
                      selectedKeys={selectedKeys}
                      onToggle={toggleSource}
                    />
                  ))}
                </TreeView>
              </TreeProvider>
            </LoadingContent>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function SourceNode({
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
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggle(source, checked === true)}
            onClick={(event) => event.stopPropagation()}
          />
          <TreeLabel>{item.name}</TreeLabel>
        </div>
      </TreeNodeTrigger>
      <TreeNodeContent hasChildren={isExpanded}>
        {children.length > 0 ? (
          children.map((child, index) => (
            <SourceNode
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
            No PDFs or subfolders
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
