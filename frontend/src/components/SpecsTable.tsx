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

/**
 * Tidies scraped spec values ("screw-type round" reads as a sentence), but a
 * value whose first letter is notation rather than prose must be left alone.
 * An f-number is written with a lowercase f everywhere a maker or a reviewer
 * writes it, and the infobox and comparison table beside this one print it
 * that way, so "F/3.5-4.5" here made the same lens disagree with itself.
 */
function capitalizeFirstLetter(value: string) {
  if (/^f\/\d/i.test(value)) return value;
  return value.replace(/^([a-z])/, (match) => match.toUpperCase());
}

export default function SpecsTable({ rows }: SpecsTableProps) {
  return (
    <Table>
      <TableBody>
        {rows.map(([label, value]) => (
          <TableRow key={label}>
            <TableCell className="w-1/3 font-medium text-muted-foreground">
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
