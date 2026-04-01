import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL is missing!");
  process.exit(1);
}

// Setup the pool with SSL for Render
const pool = new pg.Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false } 
});

const adapter = new PrismaPg(pool);

// Export the instance that has the adapter attached
export const prisma = new PrismaClient({ adapter });