ALTER TABLE "Member" DROP CONSTRAINT "Member_emailAccountId_fkey";
ALTER TABLE "Member" ADD CONSTRAINT "Member_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "ensure_organization_keeps_owner"()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    (TG_OP = 'DELETE' AND OLD."role" = 'owner') OR
    (TG_OP = 'UPDATE' AND OLD."role" = 'owner' AND NEW."role" IS DISTINCT FROM 'owner')
  ) THEN
    -- Serialize owner removal/demotion per organization so concurrent changes
    -- cannot each observe the other owner and leave the organization ownerless.
    PERFORM 1
    FROM "Organization"
    WHERE "id" = OLD."organizationId"
    FOR UPDATE;

    IF NOT FOUND THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "Member"
      WHERE "organizationId" = OLD."organizationId"
        AND "role" = 'owner'
        AND "id" <> OLD."id"
    ) THEN
      RAISE EXCEPTION 'organization_must_have_owner'
        USING ERRCODE = '23514',
              CONSTRAINT = 'organization_must_have_owner';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ensure_organization_keeps_owner_trigger" ON "Member";

CREATE TRIGGER "ensure_organization_keeps_owner_trigger"
BEFORE DELETE OR UPDATE OF "role" ON "Member"
FOR EACH ROW
EXECUTE FUNCTION "ensure_organization_keeps_owner"();
