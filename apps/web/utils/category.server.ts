import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";

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
