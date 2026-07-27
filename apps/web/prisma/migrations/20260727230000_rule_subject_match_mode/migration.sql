-- Subject conditions can match as a substring (default) or anchored at the start
CREATE TYPE "SubjectMatchMode" AS ENUM ('CONTAINS', 'STARTS_WITH');
ALTER TABLE "Rule" ADD COLUMN "subjectMatchMode" "SubjectMatchMode" NOT NULL DEFAULT 'CONTAINS';
