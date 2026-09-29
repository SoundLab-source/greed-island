import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.ts";

export { Prisma };
export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export function createDb(url: string | undefined = process.env["DATABASE_URL"]): Db {
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
