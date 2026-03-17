import { PrismaClient } from "./generated/prisma/client";

// Singleton pattern to prevent multiple Prisma client instances in Next.js dev mode
// (hot-reload creates new module instances; global persists across reloads)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
