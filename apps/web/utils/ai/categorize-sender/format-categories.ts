import type { Category } from "@prisma/client";

export function formatCategoriesForPrompt(
  categories: Pick<Category, "name" | "description">[],
): string {
  return categories
    .map((category) => `- ${category.name}: ${category.description}`)
    .join("\n");
}
