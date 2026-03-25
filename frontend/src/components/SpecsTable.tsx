import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

interface SpecsTableProps {
  rows: [string, string][];
}

function parseListItems(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const separator = trimmed.includes(";") ? /;\s*/ : /,\s+/;
  const parts = trimmed.split(separator).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : null;
}

function capitalizeFirstLetter(value: string) {
  return value.replace(/^([a-z])/, (match) => match.toUpperCase());
}

export default function SpecsTable({ rows }: SpecsTableProps) {
  return (
    <Table>
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell className="w-1/3 font-medium text-zinc-500 dark:text-zinc-400">
              {label}
            </TableCell>
            <TableCell>
              {(() => {
                const items = parseListItems(value);
                if (!items) return capitalizeFirstLetter(value);
                return (
                  <ul className="space-y-1">
                    {items.map((item, i) => (
                      <li key={`${label}-${i}`}>{capitalizeFirstLetter(item)}</li>
                    ))}
                  </ul>
                );
              })()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
