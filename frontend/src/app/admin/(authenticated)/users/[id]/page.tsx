"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type User = {
  id: number;
  email: string;
  displayName: string;
  role: string;
  editCount: number | null;
  emailVerifiedAt: string | null;
  isBanned: boolean | null;
  banReason: string | null;
  createdAt: string;
};

type Edit = {
  id: number;
  entityType: string;
  entityId: number;
  revisionNumber: number;
  summary: string;
  changedFields: string[];
  isRevert: boolean | null;
  createdAt: string;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState("");
  const [banReason, setBanReason] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/users/${userId}`);
    const data = await res.json();
    setUser(data.user);
    setEdits(data.recentEdits || []);
    setRole(data.user.role);
    setBanReason(data.user.banReason || "");
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function updateRole(newRole: string) {
    setSaving(true);
    await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setRole(newRole);
    setSaving(false);
  }

  async function toggleBan() {
    setSaving(true);
    const newBanned = !user?.isBanned;
    await fetch(`/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isBanned: newBanned,
        banReason: newBanned ? banReason : null,
      }),
    });
    fetchData();
    setSaving(false);
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!user) {
    return <div className="p-6 text-sm text-muted-foreground">User not found.</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="text-sm text-muted-foreground hover:underline">
          &larr; Users
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {user.displayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant={user.role === "admin" ? "default" : user.role === "trusted" ? "system" : "outline"}>
            {user.role}
          </Badge>
          {user.isBanned && <Badge variant="destructive">Banned</Badge>}
          <span className="text-xs text-muted-foreground">
            Joined {formatDate(user.createdAt)} — {user.editCount ?? 0} edits
          </span>
        </div>
      </div>

      {/* Role management */}
      <div className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">Role</h3>
        <div className="flex gap-2">
          {["user", "trusted", "admin"].map((r) => (
            <Button
              key={r}
              variant={role === r ? "default" : "outline"}
              size="sm"
              onClick={() => updateRole(r)}
              disabled={saving}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {/* Ban management */}
      <div className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">
          {user.isBanned ? "User is banned" : "Ban user"}
        </h3>
        {user.isBanned && user.banReason && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Reason: {user.banReason}
          </p>
        )}
        {!user.isBanned && (
          <Input
            placeholder="Ban reason (optional)"
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            className="max-w-xs"
          />
        )}
        <Button
          variant={user.isBanned ? "outline" : "destructive"}
          size="sm"
          onClick={toggleBan}
          disabled={saving}
        >
          {user.isBanned ? "Unban" : "Ban user"}
        </Button>
      </div>

      {/* Edit history */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Recent Edits ({edits.length})</h3>
        {edits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edits yet.</p>
        ) : (
          <div className="space-y-1">
            {edits.map((edit) => (
              <div
                key={edit.id}
                className="flex items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {edit.entityType}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/history/${edit.entityType}/${edit.entityId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    r{edit.revisionNumber} — {edit.summary}
                  </Link>
                  {edit.isRevert && (
                    <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      revert
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(edit.createdAt)}
                    {edit.changedFields?.length > 0 && (
                      <span> — {edit.changedFields.join(", ")}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
