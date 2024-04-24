import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";

export async function LastLogin({ email }: { email: string }) {
  try {
    await prisma.user.update({
      where: { email },
      data: { lastLogin: new Date() },
    });
  } catch (error) {
    captureException(error);
  }

  return null;
}
