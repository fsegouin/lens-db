import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={i}>
          {Array.from({ length: columns }, (_, j) => (
            <TableCell key={j} className="min-w-0 whitespace-normal p-2">
              <Skeleton className="h-4 w-full max-w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
