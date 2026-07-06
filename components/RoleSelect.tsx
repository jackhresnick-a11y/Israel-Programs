"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/roles";

export default function RoleSelect({
  userId,
  role,
}: {
  userId: string;
  role: Role;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: Role) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  return (
    <select
      value={role}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as Role)}
      className="rounded-lg border border-black/10 bg-transparent px-2 py-1 text-sm dark:border-white/15"
    >
      <option value="user">User</option>
      <option value="moderator">Moderator</option>
      <option value="admin">Admin</option>
      <option value="banned">Banned</option>
    </select>
  );
}
