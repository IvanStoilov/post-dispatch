import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { termsAcceptances } from "@/db/schema";

// Every query on terms acceptances. The table is append-only: the
// database rejects updates and deletes, so evidence can't be rewritten.

// Records an acceptance; accepting the same version again keeps the
// original record.
export async function insertAcceptance(
  values: Omit<typeof termsAcceptances.$inferInsert, "id" | "acceptedAt">,
) {
  await getDb().insert(termsAcceptances).values(values).onConflictDoNothing();
}

export function listByUser(userId: string) {
  return getDb()
    .select({
      id: termsAcceptances.id,
      termsVersion: termsAcceptances.termsVersion,
      acceptedAt: termsAcceptances.acceptedAt,
    })
    .from(termsAcceptances)
    .where(eq(termsAcceptances.userId, userId))
    .orderBy(desc(termsAcceptances.acceptedAt));
}

export async function findOwned(userId: string, id: string) {
  const [record] = await getDb()
    .select()
    .from(termsAcceptances)
    .where(
      and(eq(termsAcceptances.userId, userId), eq(termsAcceptances.id, id)),
    );
  return record;
}
