"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type User = {
  id: number;
  email: string;
  displayName: string;
  role: string;
  editCount: number | null;
  emailVerifiedAt: string | null;
  isBanned: boolean | null;
  createdAt: string;
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users);
    setTotal(data.total);
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    const timer = setTimeout(fetchData, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Users
        </h1>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      <Input
        placeholder="Search by display name..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="max-w-xs"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="pb-2 pr-4 font-medium text-muted-foreground">User</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Role</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Edits</th>
                <th className="pb-2 pr-4 font-medium text-muted-foreground">Joined</th>
                <th className="pb-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                    >
                      {user.displayName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge
                      variant={
                        user.role === "admin"
                          ? "default"
                          : user.role === "trusted"
                          ? "system"
                          : "outline"
                      }
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{user.editCount ?? 0}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="py-2">
                    {user.isBanned ? (
                      <Badge variant="destructive">Banned</Badge>
                    ) : user.emailVerifiedAt ? (
                      <span className="text-xs text-green-600 dark:text-green-400">Verified</span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Unverified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / 50)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
