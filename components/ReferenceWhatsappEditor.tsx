"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

// Only ever pass these three fields for a Reference to this component --
// never the full row (which also carries contactEmail/userId).
export default function ReferenceWhatsappEditor({
  referenceId,
  whatsappNumber,
  whatsappNumberSource,
}: {
  referenceId: string;
  whatsappNumber: string | null;
  whatsappNumberSource: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [number, setNumber] = useState(whatsappNumber ?? "");
  const [source, setSource] = useState(whatsappNumberSource ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/references/${referenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: number, whatsappNumberSource: source }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save");
      }
      toast("WhatsApp number saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setNumber("");
    setSource("");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/references/${referenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappNumber: "", whatsappNumberSource: "" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to clear");
      }
      toast("WhatsApp number cleared");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex flex-col gap-1.5 sm:flex-row">
        <Input
          placeholder="+972 50 123 4567"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="sm:max-w-48"
        />
        <Input
          placeholder="Source (e.g. how this number was obtained)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="sm:flex-1"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {whatsappNumber && (
          <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={clear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
