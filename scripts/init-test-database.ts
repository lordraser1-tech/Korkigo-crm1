/**
 * Oznacza bazę wskazaną przez `DATABASE_URL` jako testową.
 *
 * Testy kasują całą zawartość bazy przed każdym przypadkiem, więc robią to
 * wyłącznie tam, gdzie stoi ten znacznik. Zakłada się go **raz, świadomie** —
 * celowo nie powstaje sam przy `npm test`, bo wtedy niczego by nie chronił
 * (audyt zewnętrzny, F12).
 *
 *   DATABASE_URL=... npm run db:test:init
 */
import { PrismaClient } from "@prisma/client";

const MARKER_TABLE = "_korkigo_test_database";

async function main() {
  const prisma = new PrismaClient();
  try {
    const [{ db }] = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
      "SELECT current_database() AS db"
    );
    const [{ tables }] = await prisma.$queryRawUnsafe<Array<{ tables: bigint }>>(
      `SELECT count(*) AS tables FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name NOT LIKE '\\_%'`
    );

    console.log(`Baza:  ${db}`);
    console.log(`Tabel: ${tables}`);
    console.log("");
    console.log("Po założeniu znacznika testy będą KASOWAĆ zawartość tej bazy.");

    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${MARKER_TABLE}" (
         "markedAt" timestamptz NOT NULL DEFAULT now()
       )`
    );
    await prisma.$executeRawUnsafe(`INSERT INTO "${MARKER_TABLE}" DEFAULT VALUES`);

    console.log(`\n✔ Znacznik założony. Testy mogą używać bazy „${db}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
