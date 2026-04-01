import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

// 1. Configure the Pool Limits & SSL
const pool = new Pool({ 
  connectionString,
  max: 10, // Maximum number of clients the pool should contain (adjust based on your DB tier limits)
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection cannot be established
  
  // Hosted databases (like Render, Heroku, Supabase) often require SSL. 
  // If your deployment fails to connect to the DB, uncomment the line below:
  // ssl: { rejectUnauthorized: false } 
});

// 2. Handle Idle Client Errors
// If a connected client experiences an error (like a network blip), it can crash the entire Node process if unhandled.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

const adapter = new PrismaPg(pool);

// 3. Singleton Pattern & Logging
// Prevents Next.js / Node.js hot-reloads from exhausting database connections during development.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ 
  adapter,
  log: ['warn', 'error'], // Good default for production. Add 'query' if you need to debug slow queries.
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;