import prisma from "@/utils/prisma";

export const getUserCategories = async (userId: string) => {
  const categories = await prisma.category.findMany({ where: { userId } });
  return categories;
};
