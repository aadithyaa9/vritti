import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/vritti';
const pool = new Pool({ connectionString });
export const prisma = new PrismaClient({
    adapter: new PrismaPg({ pool }),
});
//# sourceMappingURL=prisma.js.map