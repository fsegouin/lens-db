import { db } from "@/db";
import { lenses } from "@/db/schema";
import { sql } from "drizzle-orm";

export async function getDistinctLensTags() {
  const [lensTypes, eras, productionStatuses] = await Promise.all([
    db
      .selectDistinct({ value: lenses.lensType })
      .from(lenses)
      .where(sql`${lenses.lensType} IS NOT NULL AND ${lenses.lensType} != ''`)
      .orderBy(lenses.lensType)
      .then((rows) => rows.map((r) => r.value!)),
    db
      .selectDistinct({ value: lenses.era })
      .from(lenses)
      .where(sql`${lenses.era} IS NOT NULL AND ${lenses.era} != ''`)
      .orderBy(lenses.era)
      .then((rows) => rows.map((r) => r.value!)),
    db
      .selectDistinct({ value: lenses.productionStatus })
      .from(lenses)
      .where(sql`${lenses.productionStatus} IS NOT NULL AND ${lenses.productionStatus} != ''`)
      .orderBy(lenses.productionStatus)
      .then((rows) => rows.map((r) => r.value!)),
  ]);

  return { lensTypes, eras, productionStatuses };
}
