import prisma from "@/utils/prisma";
import { getErrorMessage, SafeError } from "@/utils/error";

const ORGANIZATION_OWNER_CONSTRAINT_NAME = "organization_must_have_owner";
const MEMBER_EMAIL_ACCOUNT_FK_CONSTRAINT_NAME = "Member_emailAccountId_fkey";

export const DELETE_EMAIL_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR =
  "Transfer organization ownership before deleting this email account.";

export const DELETE_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR =
  "Transfer organization ownership before deleting your account.";

export async function getDeletedAccountOwnershipImpact(
  emailAccountIds: string[],
) {
  const deletedEmailAccountIds = new Set(emailAccountIds);
  if (deletedEmailAccountIds.size === 0) {
    return {
      organizationsRequiringOwnershipTransfer: [],
      organizationsToDelete: [],
    };
  }

  // Ownerless organizations have no owner row to discover, so start from every
  // deleted membership.
  const memberships = await prisma.member.findMany({
    where: {
      emailAccountId: { in: [...deletedEmailAccountIds] },
    },
    select: { organizationId: true },
  });

  const organizationIds = [
    ...new Set(memberships.map((member) => member.organizationId)),
  ];
  if (organizationIds.length === 0) {
    return {
      organizationsRequiringOwnershipTransfer: [],
      organizationsToDelete: [],
    };
  }

  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    select: {
      id: true,
      name: true,
      members: {
        select: { emailAccountId: true, role: true },
      },
    },
  });

  const organizationsRequiringOwnershipTransfer = [];
  const organizationsToDelete = [];

  for (const organization of organizations) {
    const keepsOwner = organization.members.some(
      (member) =>
        member.role === "owner" &&
        !deletedEmailAccountIds.has(member.emailAccountId),
    );
    if (keepsOwner) continue;

    const keepsAnyMember = organization.members.some(
      (member) => !deletedEmailAccountIds.has(member.emailAccountId),
    );

    if (keepsAnyMember) {
      organizationsRequiringOwnershipTransfer.push(organization);
    } else {
      organizationsToDelete.push(organization);
    }
  }

  return { organizationsRequiringOwnershipTransfer, organizationsToDelete };
}

export async function getUserDeletionOwnershipImpact(userId: string) {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: { id: true },
  });

  return getDeletedAccountOwnershipImpact(
    emailAccounts.map((account) => account.id),
  );
}

export function getDeletableOrganizationIdsOrThrow(
  ownershipImpact: Awaited<ReturnType<typeof getDeletedAccountOwnershipImpact>>,
  errorMessage: string,
) {
  if (ownershipImpact.organizationsRequiringOwnershipTransfer.length > 0) {
    throw new SafeError(errorMessage);
  }

  return ownershipImpact.organizationsToDelete.map(
    (organization) => organization.id,
  );
}

export function getDeleteSoloOrganizationsOperation(
  organizationIds: string[],
  deletedEmailAccountIds: string[],
) {
  return prisma.organization.deleteMany({
    where: {
      id: { in: organizationIds },
      members: {
        every: { emailAccountId: { in: deletedEmailAccountIds } },
      },
    },
  });
}

export function isOrganizationOwnerInvariantError(error: unknown) {
  return errorIncludesConstraint(error, ORGANIZATION_OWNER_CONSTRAINT_NAME);
}

export function isMemberEmailAccountForeignKeyError(error: unknown) {
  return errorIncludesConstraint(
    error,
    MEMBER_EMAIL_ACCOUNT_FK_CONSTRAINT_NAME,
  );
}

function errorIncludesConstraint(error: unknown, constraintName: string) {
  const message = getErrorMessage(error);
  if (message?.includes(constraintName)) return true;

  if (typeof error !== "object" || error === null) return false;

  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return false;

  return Object.values(meta).some(
    (value) => typeof value === "string" && value.includes(constraintName),
  );
}
