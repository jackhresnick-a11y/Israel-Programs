"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/lib/roles";
import Select from "@/components/ui/Select";

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
    <Select
      value={role}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as Role)}
      className="py-1"
    >
      <option value="user">User</option>
      <option value="moderator">Moderator</option>
      <option value="admin">Admin</option>
      <option value="banned">Banned</option>
    </Select>
  );
}
