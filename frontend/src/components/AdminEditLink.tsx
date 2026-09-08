"use client";

import Link from "next/link";
import { useUser } from "@/components/user-context";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A shortcut from a public lens or camera page to its admin edit form, where
 * images and the fields the member dialog does not expose are managed.
 *
 * The page is cached HTML shared by every visitor, so the link is decided in
 * the browser from the user context the header already loads. Nobody but an
 * admin ever sees it, and no extra request is made to find that out.
 *
 * `compact` is the small form for the provenance row under the title, kept
 * off phones where it would wrap onto its own line; the default is a button
 * for the edit row at the foot of the page, which covers every width.
 *
 * A plain styled Link rather than the Button primitive: Base UI's button
 * expects a native button element and complains when handed an anchor.
 */
export default function AdminEditLink({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: "lens" | "camera";
  entityId: number;
  compact?: boolean;
}) {
  const { user } = useUser();
  if (user?.role !== "admin") return null;

  const href = `/admin/${entityType === "lens" ? "lenses" : "cameras"}/${entityId}/edit`;
  const title = "Open in the admin editor, with images";

  return (
    <Link
      href={href}
      title={title}
      className={cn(
        buttonVariants(
          compact ? { variant: "ghost", size: "xs" } : { variant: "outline", size: "sm" },
        ),
        // The negative margin lets the 24px control overhang the 16px
        // provenance row, so the page below does not drop by 8px for an
        // admin once the session resolves.
        compact && "-my-1 hidden text-muted-foreground sm:inline-flex",
      )}
    >
      Admin edit
    </Link>
  );
}
