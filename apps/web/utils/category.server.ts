import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";

export type CategoryWithRules = Prisma.CategoryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    rules: { select: { id: true; name: true } };
  };
}>;

export const getUserCategories = async (userId: string) => {
  const categories = await prisma.category.findMany({ where: { userId } });
  return categories;
};

export const getUserCategoriesWithRules = async (userId: string) => {
  const categories = await prisma.category.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      description: true,
      rules: { select: { id: true, name: true } },
    },
  });
  return categories;
};

export const getUserCategoriesForNames = async (
  userId: string,
  names: string[],
) => {
  if (!names.length) return [];

  const categories = await prisma.category.findMany({
    where: { userId, name: { in: names } },
    select: { id: true },
  });
  if (categories.length !== names.length) {
    console.warn("Not all categories were found", {
      requested: names.length,
      found: categories.length,
      names,
    });
  }
  return categories.map((c) => c.id);
};
