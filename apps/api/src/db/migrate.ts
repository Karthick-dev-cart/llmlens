import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? "postgres://llmlens:llmlens@localhost:5432/llmlens";
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log("Running drizzle migrations...");
  await migrate(db, { migrationsFolder: join(__dirname, "migrations") });

  console.log("Applying manual SQL (hypertable + continuous aggregates)...");
  const manualDir = join(__dirname, "manual-sql");
  const files = readdirSync(manualDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const statement = readFileSync(join(manualDir, file), "utf-8");
    await sql.unsafe(statement);
    console.log(`  applied ${file}`);
  }

  await sql.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
