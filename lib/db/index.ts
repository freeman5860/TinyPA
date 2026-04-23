import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Drizzle = ReturnType<typeof drizzle<typeof schema>>;
type Conn = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { conn?: Conn; drz?: Drizzle };

function initDb(): Drizzle {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in Vercel Settings → Environment Variables."
    );
  }
  const conn = globalForDb.conn ?? postgres(connectionString, { max: 5, prepare: false });
  if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;
  const drz = drizzle(conn, { schema });
  if (process.env.NODE_ENV !== "production") globalForDb.drz = drz;
  return drz;
}

export const db: Drizzle = process.env.DATABASE_URL
  ? initDb()
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            "DATABASE_URL is not set. Configure it in Vercel Settings → Environment Variables."
          );
        },
      }
    ) as Drizzle);

export * from "./schema";
