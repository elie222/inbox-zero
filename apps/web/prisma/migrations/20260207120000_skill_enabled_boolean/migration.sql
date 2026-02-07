-- Replace SkillStatus enum with enabled boolean
ALTER TABLE "Skill" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- Migrate existing data: ACTIVE -> true, everything else -> false
UPDATE "Skill" SET "enabled" = CASE WHEN "status" = 'ACTIVE' THEN true ELSE false END;

-- Drop the old column and enum
ALTER TABLE "Skill" DROP COLUMN "status";
DROP TYPE "SkillStatus";
