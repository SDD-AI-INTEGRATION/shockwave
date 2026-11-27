import "dotenv/config";
import { Pool } from "pg";
import { createApp } from "./app.js";
import { migrate } from "./migrate.js";
import { validateTransport } from './network.js';
import { startEarlyWarning } from "./notifications.js";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL wajib diisi di backend/.env.");
  validateTransport();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  await migrate(pool);
  const app = await createApp(pool);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000), "0.0.0.0");
  startEarlyWarning(pool);
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
