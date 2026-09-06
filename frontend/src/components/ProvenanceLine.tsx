import Link from "next/link";

type Props = {
  entityType: "lens" | "camera";
  entityId: number;
  revisionCount: number;
  lastEditedAt: Date | string | null;
  lastEditor?: { displayName: string; handle: string; editedAt?: Date | string | null } | null;
  saleCount: number;
};

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Who touched this record and when, directly under the title. A reference is
 * trusted because it shows its working, and this line is the cheapest possible
 * version of that: edit count, last change, evidence behind the price, source.
 */
export default function ProvenanceLine({
  entityType,
  entityId,
  revisionCount,
  lastEditedAt,
  lastEditor,
  saleCount,
}: Props) {
  const edited = lastEditedAt ? formatDate(lastEditedAt) : null;

  const parts: React.ReactNode[] = [];
  // Credit by name is the cheapest reward the site can pay an editor, and
  // the title line is where every reader sees it.
  // The most recent revision may be the import bot's, in which case the
  // person's edit has its own, earlier date and must not borrow the newer one.
  const editorDate = lastEditor?.editedAt ? formatDate(lastEditor.editedAt) : null;
  const sameDate = !editorDate || editorDate === edited;
  if (edited) {
    parts.push(
      <span key="edited">
        Last edited {edited}
        {lastEditor && sameDate && (
          <>
            {" by "}
            <Link
              href={`/community/${lastEditor.handle}`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {lastEditor.displayName}
            </Link>
          </>
        )}
      </span>,
    );
  }
  if (lastEditor && !sameDate) {
    parts.push(
      <span key="editor">
        <Link
          href={`/community/${lastEditor.handle}`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {lastEditor.displayName}
        </Link>
        {" edited "}
        {editorDate}
      </span>,
    );
  }
  if (revisionCount > 0) {
    parts.push(
      <Link
        key="revs"
        href={`/history/${entityType}/${entityId}`}
        className="underline underline-offset-2 hover:text-foreground"
      >
        {revisionCount.toLocaleString()}{" "}
        {revisionCount === 1 ? "revision" : "revisions"}
      </Link>,
    );
  }
  if (saleCount > 0) {
    parts.push(
      <span key="sales" className="tabular-nums">
        {saleCount.toLocaleString()} recorded {saleCount === 1 ? "sale" : "sales"}
      </span>,
    );
  }
  if (parts.length === 0) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          {part}
        </span>
      ))}
    </p>
  );
}
