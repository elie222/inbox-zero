// https://www.prisma.io/blog/testing-series-1-8eRB5p0Y8o#why-mock-prisma-client
import type { PrismaClient } from "@prisma/client";
import { beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

beforeEach(() => {
  mockReset(prisma);
});

const prisma = mockDeep<PrismaClient>();
export default prisma;
