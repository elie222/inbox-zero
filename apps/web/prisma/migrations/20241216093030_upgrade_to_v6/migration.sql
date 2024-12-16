-- AlterTable
ALTER TABLE "_CategoryToRule" ADD CONSTRAINT "_CategoryToRule_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CategoryToRule_AB_unique";
