import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

dotenv.config({
  path: path.resolve(
    path.dirname(
      fileURLToPath(
        import.meta.url,
      ),
    ),
    '../../../.env',
  ),
});

const connectionString =
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set',
  );
}

const adapter =
  new PrismaPg({
    connectionString,
  });

const globalForPrisma =
  globalThis as unknown as {
    prisma?: PrismaClient;
  };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (
  process.env.NODE_ENV !==
  'production'
) {
  globalForPrisma.prisma =
    prisma;
}