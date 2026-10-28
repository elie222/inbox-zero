import type { EmailLabel } from "@/providers/email-label-types";

export type SidebarLabel = {
  label: EmailLabel;
  name: string;
  children: SidebarLabel[];
};

export function getLabelTree(
  labels: EmailLabel[],
  nested: boolean,
): SidebarLabel[] {
  const nodes = labels.map((label) => ({
    label,
    name: label.name,
    children: [] as SidebarLabel[],
  }));
  if (!nested) return nodes;

  const byName = new Map(nodes.map((node) => [node.label.name, node]));
  const roots: SidebarLabel[] = [];
  for (const node of nodes) {
    let separator = node.label.name.lastIndexOf("/");
    let parent: SidebarLabel | undefined;
    while (separator > 0) {
      parent = byName.get(node.label.name.slice(0, separator));
      if (parent) break;
      separator = node.label.name.lastIndexOf("/", separator - 1);
    }
    if (parent) {
      node.name = node.label.name.slice(separator + 1);
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
