import { PrismaPg } from '@prisma/adapter-pg';
import config from '../config/index.js';
import { PrismaClient } from '../generated/prisma/client.ts';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.db.url }),
});

export default prisma;
