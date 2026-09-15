-- Legacy SCIM credentials and identities require an explicit operator cutover.
-- Never silently drop an active provisioning connection.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "scimProvider") THEN
    RAISE EXCEPTION 'Migrate legacy SCIM connections before applying Better Auth 1.7; see docs/better-auth-1.7-upgrade.md';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "scimProvider" DROP CONSTRAINT "scimProvider_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "scimProvider" DROP CONSTRAINT "scimProvider_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "scimAccessDisabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OauthClient" DROP COLUMN "public",
DROP COLUMN "type",
ADD COLUMN     "applicationType" TEXT,
ADD COLUMN     "backchannelLogoutSessionRequired" BOOLEAN,
ADD COLUMN     "backchannelLogoutUri" TEXT,
ADD COLUMN     "clientCredentialsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "clientDiscoveryId" TEXT,
ADD COLUMN     "dpopBoundAccessTokens" BOOLEAN DEFAULT false,
ADD COLUMN     "jwks" TEXT,
ADD COLUMN     "jwksUri" TEXT;

-- AlterTable
ALTER TABLE "OauthRefreshToken" ADD COLUMN     "authorizationCodeId" TEXT,
ADD COLUMN     "confirmation" JSONB,
ADD COLUMN     "requestedUserInfoClaims" TEXT[],
ADD COLUMN     "resources" TEXT[],
ADD COLUMN     "rotatedAt" TIMESTAMP(3),
ADD COLUMN     "rotationReplayExpiresAt" TIMESTAMP(3),
ADD COLUMN     "rotationReplayResponse" TEXT;

-- AlterTable
ALTER TABLE "OauthAccessToken" ADD COLUMN     "authorizationCodeId" TEXT,
ADD COLUMN     "confirmation" JSONB,
ADD COLUMN     "requestedUserInfoClaims" TEXT[],
ADD COLUMN     "resources" TEXT[],
ADD COLUMN     "revoked" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OauthConsent" ADD COLUMN     "requestedUserInfoClaims" TEXT[],
ADD COLUMN     "resources" TEXT[];

-- AlterTable
ALTER TABLE "Jwks" ADD COLUMN     "alg" TEXT,
ADD COLUMN     "crv" TEXT;

-- DropTable
DROP TABLE "scimProvider";

-- CreateTable
CREATE TABLE "OauthResource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "OauthResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthClientResource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "OauthClientResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthClientAssertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OauthClientAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimManagedConnection" (
    "id" TEXT NOT NULL,
    "creationRequestId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provisioningDomainId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "decommissionStartedAt" TIMESTAMP(3),
    "decommissionStartedBy" TEXT,
    "decommissionedAt" TIMESTAMP(3),
    "decommissionedBy" TEXT,

    CONSTRAINT "scimManagedConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimManagedCredential" (
    "id" TEXT NOT NULL,
    "connectionRecordId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "hashVersion" TEXT NOT NULL,
    "activeSlotKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "serializedScopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "decommissionedAt" TIMESTAMP(3),

    CONSTRAINT "scimManagedCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimManagedConnectionEvent" (
    "id" TEXT NOT NULL,
    "connectionRecordId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "credentialId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimManagedConnectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimConnectionBinding" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "connectionKey" TEXT NOT NULL,
    "provisioningDomainId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "decommissionedAt" TIMESTAMP(3),
    "decommissionStatus" TEXT NOT NULL DEFAULT 'active',
    "decommissionCursorUserId" TEXT,
    "decommissionReconciledUserCount" INTEGER NOT NULL DEFAULT 0,
    "decommissionBatchCount" INTEGER NOT NULL DEFAULT 0,
    "decommissionRevision" INTEGER NOT NULL DEFAULT 0,
    "decommissionCompletedAt" TIMESTAMP(3),
    "decommissionLeaseId" TEXT,
    "decommissionLeaseExpiresAt" TIMESTAMP(3),

    CONSTRAINT "scimConnectionBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimIdentityTombstone" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provisioningDomainId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalIdKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimIdentityTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimSubject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileSourceId" TEXT,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimUser" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provisioningDomainId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionUserKey" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userNameKey" TEXT NOT NULL,
    "primaryEmail" TEXT NOT NULL,
    "workEmailValueIndex" TEXT NOT NULL,
    "emailValueIndex" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "formattedName" TEXT NOT NULL,
    "givenName" TEXT,
    "familyName" TEXT,
    "serializedEmails" TEXT NOT NULL,
    "serializedAttributes" TEXT,
    "externalId" TEXT,
    "externalIdKey" TEXT,
    "active" BOOLEAN NOT NULL,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimProjectionGrant" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provisioningDomainId" TEXT NOT NULL,
    "scimUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceValue" TEXT,
    "role" TEXT NOT NULL,
    "grantKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimProjectionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimGroup" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provisioningDomainId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "displayName" TEXT NOT NULL,
    "displayNameKey" TEXT NOT NULL,
    "externalId" TEXT,
    "externalIdKey" TEXT,
    "orderKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scimGroupMember" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "scimUserId" TEXT NOT NULL,
    "membershipKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scimGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScimIdentityLink" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ScimIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OauthResource_identifier_key" ON "OauthResource"("identifier");

-- CreateIndex
CREATE INDEX "OauthClientResource_clientId_idx" ON "OauthClientResource"("clientId");

-- CreateIndex
CREATE INDEX "OauthClientResource_resourceId_idx" ON "OauthClientResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" ON "OauthClientResource"("clientId", "resourceId");

-- CreateIndex
CREATE INDEX "scimManagedConnection_provisioningDomainId_idx" ON "scimManagedConnection"("provisioningDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "scimManagedConnection_creationRequestId_key" ON "scimManagedConnection"("creationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "scimManagedConnection_connectionId_key" ON "scimManagedConnection"("connectionId");

-- CreateIndex
CREATE INDEX "scimManagedCredential_connectionRecordId_idx" ON "scimManagedCredential"("connectionRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "scimManagedCredential_credentialId_key" ON "scimManagedCredential"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "scimManagedCredential_activeSlotKey_key" ON "scimManagedCredential"("activeSlotKey");

-- CreateIndex
CREATE INDEX "scimManagedConnectionEvent_connectionRecordId_idx" ON "scimManagedConnectionEvent"("connectionRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "scimManagedConnectionEvent_eventKey_key" ON "scimManagedConnectionEvent"("eventKey");

-- CreateIndex
CREATE INDEX "scimConnectionBinding_connectionId_idx" ON "scimConnectionBinding"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "scimConnectionBinding_connectionKey_key" ON "scimConnectionBinding"("connectionKey");

-- CreateIndex
CREATE INDEX "scimIdentityTombstone_connectionId_idx" ON "scimIdentityTombstone"("connectionId");

-- CreateIndex
CREATE INDEX "scimIdentityTombstone_provisioningDomainId_idx" ON "scimIdentityTombstone"("provisioningDomainId");

-- CreateIndex
CREATE INDEX "scimIdentityTombstone_userId_idx" ON "scimIdentityTombstone"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "scimIdentityTombstone_externalIdKey_key" ON "scimIdentityTombstone"("externalIdKey");

-- CreateIndex
CREATE INDEX "scimSubject_profileSourceId_idx" ON "scimSubject"("profileSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "scimSubject_userId_key" ON "scimSubject"("userId");

-- CreateIndex
CREATE INDEX "scimUser_connectionId_idx" ON "scimUser"("connectionId");

-- CreateIndex
CREATE INDEX "scimUser_provisioningDomainId_idx" ON "scimUser"("provisioningDomainId");

-- CreateIndex
CREATE INDEX "scimUser_userId_idx" ON "scimUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "scimUser_connectionUserKey_key" ON "scimUser"("connectionUserKey");

-- CreateIndex
CREATE UNIQUE INDEX "scimUser_userNameKey_key" ON "scimUser"("userNameKey");

-- CreateIndex
CREATE UNIQUE INDEX "scimUser_externalIdKey_key" ON "scimUser"("externalIdKey");

-- CreateIndex
CREATE UNIQUE INDEX "scimUser_orderKey_key" ON "scimUser"("orderKey");

-- CreateIndex
CREATE INDEX "scimProjectionGrant_connectionId_idx" ON "scimProjectionGrant"("connectionId");

-- CreateIndex
CREATE INDEX "scimProjectionGrant_provisioningDomainId_idx" ON "scimProjectionGrant"("provisioningDomainId");

-- CreateIndex
CREATE INDEX "scimProjectionGrant_scimUserId_idx" ON "scimProjectionGrant"("scimUserId");

-- CreateIndex
CREATE INDEX "scimProjectionGrant_userId_idx" ON "scimProjectionGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "scimProjectionGrant_grantKey_key" ON "scimProjectionGrant"("grantKey");

-- CreateIndex
CREATE INDEX "scimGroup_connectionId_idx" ON "scimGroup"("connectionId");

-- CreateIndex
CREATE INDEX "scimGroup_provisioningDomainId_idx" ON "scimGroup"("provisioningDomainId");

-- CreateIndex
CREATE UNIQUE INDEX "scimGroup_displayNameKey_key" ON "scimGroup"("displayNameKey");

-- CreateIndex
CREATE UNIQUE INDEX "scimGroup_externalIdKey_key" ON "scimGroup"("externalIdKey");

-- CreateIndex
CREATE UNIQUE INDEX "scimGroup_orderKey_key" ON "scimGroup"("orderKey");

-- CreateIndex
CREATE INDEX "scimGroupMember_connectionId_idx" ON "scimGroupMember"("connectionId");

-- CreateIndex
CREATE INDEX "scimGroupMember_groupId_idx" ON "scimGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "scimGroupMember_scimUserId_idx" ON "scimGroupMember"("scimUserId");

-- CreateIndex
CREATE UNIQUE INDEX "scimGroupMember_membershipKey_key" ON "scimGroupMember"("membershipKey");

-- CreateIndex
CREATE INDEX "ScimIdentityLink_userId_idx" ON "ScimIdentityLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScimIdentityLink_connectionId_externalId_key" ON "ScimIdentityLink"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "OauthRefreshToken_authorizationCodeId_idx" ON "OauthRefreshToken"("authorizationCodeId");

-- CreateIndex
CREATE INDEX "OauthAccessToken_authorizationCodeId_idx" ON "OauthAccessToken"("authorizationCodeId");

-- AddForeignKey
ALTER TABLE "OauthClientResource" ADD CONSTRAINT "OauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthClientResource" ADD CONSTRAINT "OauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OauthResource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimManagedCredential" ADD CONSTRAINT "scimManagedCredential_connectionRecordId_fkey" FOREIGN KEY ("connectionRecordId") REFERENCES "scimManagedConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimManagedConnectionEvent" ADD CONSTRAINT "scimManagedConnectionEvent_connectionRecordId_fkey" FOREIGN KEY ("connectionRecordId") REFERENCES "scimManagedConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimIdentityTombstone" ADD CONSTRAINT "scimIdentityTombstone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimSubject" ADD CONSTRAINT "scimSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimUser" ADD CONSTRAINT "scimUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimProjectionGrant" ADD CONSTRAINT "scimProjectionGrant_scimUserId_fkey" FOREIGN KEY ("scimUserId") REFERENCES "scimUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimProjectionGrant" ADD CONSTRAINT "scimProjectionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimGroupMember" ADD CONSTRAINT "scimGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "scimGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scimGroupMember" ADD CONSTRAINT "scimGroupMember_scimUserId_fkey" FOREIGN KEY ("scimUserId") REFERENCES "scimUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScimIdentityLink" ADD CONSTRAINT "ScimIdentityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
