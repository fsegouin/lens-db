"use client";

import Link from "next/link";
import { useUser } from "@/components/user-context";

type Section = { title: string; links: { href: string; label: string }[] };

/** Links only worth showing to someone who is not signed in. */
const SIGNED_OUT_ONLY = new Set(["/login", "/register"]);

/**
 * The footer link columns.
 *
 * A client component so that "Sign in" and "Create an account" can disappear
 * once someone has an account. The layout itself must stay static: reading the
 * session cookie there would make every page on the site dynamic.
 */
export default function FooterNav({ sections }: { sections: Section[] }) {
  const { user } = useUser();

  return (
    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {sections.map((section) => {
        const links = section.links.filter(
          (link) => !(user && SIGNED_OUT_ONLY.has(link.href)),
        );
        if (links.length === 0) return null;
        return (
          <div key={section.title}>
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {section.title}
            </h2>
            <ul className="mt-3 space-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
