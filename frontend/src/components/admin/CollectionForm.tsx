"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateSlug } from "./generate-slug";

interface CollectionData {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export default function CollectionForm({ collection }: { collection?: CollectionData }) {
  const router = useRouter();
  const isEdit = !!collection;

  const [name, setName] = useState(collection?.name ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState(collection?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit && !slugManuallyEdited) {
      setSlug(generateSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugManuallyEdited(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const url = isEdit
        ? `/api/admin/collections/${collection.id}`
        : "/api/admin/collections";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, description }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }

      router.push("/admin/collections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!collection) return;
    if (!window.confirm("Are you sure you want to delete this collection?")) return;

    try {
      const res = await fetch(`/api/admin/collections/${collection.id}`, {
        method: "DELETE",
      });

      // The API refuses to delete a collection that still holds lenses, since
      // that leaves a 404 on a URL its member lens pages link to. Say how many
      // and make the second confirmation spell out what is lost.
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        const lensCount = typeof body.lensCount === "number" ? body.lensCount : 0;
        const redirectCount = typeof body.redirectCount === "number" ? body.redirectCount : 0;

        const losses: string[] = [];
        if (lensCount > 0) {
          losses.push(`${lensCount} ${lensCount === 1 ? "lens" : "lenses"} would lose their membership`);
        }
        if (redirectCount > 0) {
          losses.push(
            `${redirectCount} ${redirectCount === 1 ? "redirect" : "redirects"} pointing here would be destroyed, so ${redirectCount === 1 ? "that older URL" : "those older URLs"} would 404`
          );
        }

        const proceed = window.confirm(
          `${losses.join(".\n")}.\n\n` +
            "Merging this collection into another would move the lenses and leave a redirect behind. " +
            "Deleting it now does not, and this URL will 404.\n\n" +
            "Delete anyway?"
        );
        if (!proceed) return;

        const forced = await fetch(
          `/api/admin/collections/${collection.id}?confirm=true`,
          { method: "DELETE" }
        );
        if (!forced.ok) throw new Error("Failed to delete");
        router.push("/admin/collections");
        return;
      }

      if (!res.ok) throw new Error("Failed to delete");
      router.push("/admin/collections");
    } catch {
      setError("Failed to delete collection");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {isEdit ? "Edit Collection" : "New Collection"}
      </h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>

          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
