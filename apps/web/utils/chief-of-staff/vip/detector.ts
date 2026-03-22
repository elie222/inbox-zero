// apps/web/utils/chief-of-staff/vip/detector.ts

import type { PrismaClient } from "@/generated/prisma/client";
import { getClientAppointments } from "../acuity/actions";
import { VIP_THRESHOLD } from "../types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface VipResult {
  bookingCount: number;
  groupName: string | null;
  isVip: boolean;
}

export async function checkVipStatus(
  clientEmail: string,
  prisma: PrismaClient,
): Promise<VipResult> {
  // 1. Check cache
  const cached = await prisma.vipCache.findUnique({ where: { clientEmail } });
  if (cached && Date.now() - cached.lastChecked.getTime() < CACHE_TTL_MS) {
    let groupName: string | null = null;
    if (cached.clientGroupId) {
      const group = await prisma.clientGroup.findUnique({
        where: { id: cached.clientGroupId },
      });
      groupName = group?.primaryName ?? null;
    }
    return {
      isVip: cached.isVip,
      bookingCount: cached.bookingCount,
      groupName,
    };
  }

  // 2. Find all emails in client group
  const emailsToCheck = [clientEmail];
  let groupId: string | null = null;
  let groupName: string | null = null;

  const membership = await prisma.clientGroupMember.findUnique({
    where: { email: clientEmail },
    include: { clientGroup: { include: { members: true } } },
  });

  if (membership) {
    groupId = membership.clientGroupId;
    groupName = membership.clientGroup.primaryName;
    for (const member of membership.clientGroup.members) {
      if (member.email !== clientEmail) emailsToCheck.push(member.email);
    }
  }

  // 3. Query Acuity
  let totalBookings = 0;
  for (const email of emailsToCheck) {
    const appointments = await getClientAppointments(email);
    totalBookings += appointments.filter((a) => !a.canceled).length;
  }

  const isVip = totalBookings >= VIP_THRESHOLD;

  // 4. Update cache
  await prisma.vipCache.upsert({
    where: { clientEmail },
    create: {
      clientEmail,
      clientGroupId: groupId,
      bookingCount: totalBookings,
      isVip,
      lastChecked: new Date(),
    },
    update: {
      clientGroupId: groupId,
      bookingCount: totalBookings,
      isVip,
      lastChecked: new Date(),
    },
  });

  return { isVip, bookingCount: totalBookings, groupName };
}
