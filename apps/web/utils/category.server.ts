import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type CategorySummary = Prisma.CategoryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
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

export const getUserCategorySummaries = async ({
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
    },
  });
  return categories;
};
