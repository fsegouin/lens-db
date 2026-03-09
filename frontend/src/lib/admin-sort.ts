import { asc, desc, type AnyColumn } from "drizzle-orm";

export function buildOrderBy(
  sortParam: string | null,
  orderParam: string | null,
  sortMap: Record<string, AnyColumn>,
  defaultCol: AnyColumn,
) {
  const direction = orderParam === "desc" ? desc : asc;
  const col = sortParam && sortMap[sortParam] ? sortMap[sortParam] : null;
  return col ? direction(col) : asc(defaultCol);
}
