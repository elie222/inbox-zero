-- CreateEnum
CREATE TYPE "SignupIntent" AS ENUM ('AI_ASSISTANT', 'MAIL_CLIENT', 'BOTH');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signupIntent" "SignupIntent";
