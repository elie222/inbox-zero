import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("category");

export type CategoryWithRules = Prisma.CategoryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    rules: { select: { id: true; name: true } };
  };
}>;

export const getUserCategories = async ({
  emailAccountId,
}: {
  emailAccountId: string;
}) => {
  const categories = await prisma.category.findMany({
    where: { emailAccountId },
  });
  return categories;
};

export const getUserCategoriesWithRules = async ({
  emailAccountId,
}: {
  emailAccountId: string;
}) => {
  const categories = await prisma.category.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      description: true,
      rules: { select: { id: true, name: true } },
    },
  });
  return categories;
};

export const getUserCategoriesForNames = async ({
  emailAccountId,
  names,
}: {
  emailAccountId: string;
  names: string[];
}) => {
  if (!names.length) return [];

  const categories = await prisma.category.findMany({
    where: { emailAccountId, name: { in: names } },
    select: { id: true },
  });
  if (categories.length !== names.length) {
    logger.warn("Not all categories were found", {
      requested: names.length,
      found: categories.length,
      names,
    });
  }
  return categories.map((c) => c.id);
};
