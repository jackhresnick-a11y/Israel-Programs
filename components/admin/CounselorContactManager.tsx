"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

export type SchoolSize = "BIG" | "SMALL";
export type CounselorOutreachStatus = "NOT_CONTACTED" | "CONTACTED" | "REPLIED" | "BOUNCED" | "WRONG_CONTACT";

export type CounselorContact = {
  id: string;
  schoolName: string;
  country: string;
  cityRegion: string;
  schoolSize: SchoolSize | null;
  contactName: string | null;
  email: string;
  emailIsGeneric: boolean;
  sourceUrl: string;
  notes: string | null;
  status: CounselorOutreachStatus;
  createdAt: string | Date;
};

type FormState = {
  schoolName: string;
  country: string;
  cityRegion: string;
  schoolSize: SchoolSize | "";
  contactName: string;
  email: string;
  emailIsGeneric: boolean;
  sourceUrl: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  schoolName: "",
  country: "",
  cityRegion: "",
  schoolSize: "",
  contactName: "",
  email: "",
  emailIsGeneric: false,
  sourceUrl: "",
  notes: "",
};

const STATUS_LABELS: Record<CounselorOutreachStatus, string> = {
  NOT_CONTACTED: "Not contacted",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  WRONG_CONTACT: "Wrong contact",
};

const STATUS_TONES: Record<CounselorOutreachStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  NOT_CONTACTED: "neutral",
  CONTACTED: "info",
  REPLIED: "success",
  BOUNCED: "danger",
  WRONG_CONTACT: "warning",
};

type SortKey = "country" | "schoolName" | "createdAt";

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function toPayload(form: FormState) {
  return {
    schoolName: form.schoolName,
    country: form.country,
    cityRegion: form.cityRegion,
    schoolSize: form.schoolSize || null,
    contactName: form.contactName.trim() || null,
    email: form.email,
    emailIsGeneric: form.emailIsGeneric,
    sourceUrl: form.sourceUrl,
    notes: form.notes.trim() || null,
  };
}

export default function CounselorContactManager({ contacts }: { contacts: CounselorContact[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);

  const [filterCountry, setFilterCountry] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("country");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const countries = useMemo(
    () => Array.from(new Set(contacts.map((c) => c.country))).sort(),
    [contacts],
  );

  const visible = useMemo(() => {
    const filtered = contacts.filter(
      (c) => (!filterCountry || c.country === filterCountry) && (!filterStatus || c.status === filterStatus),
    );
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else {
        cmp = a[sortKey].localeCompare(b[sortKey]);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [contacts, filterCountry, filterStatus, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function startCreate() {
    setEditingId("new");
    setForm(EMPTY_FORM);
  }

  function startEdit(contact: CounselorContact) {
    setEditingId(contact.id);
    setForm({
      schoolName: contact.schoolName,
      country: contact.country,
      cityRegion: contact.cityRegion,
      schoolSize: contact.schoolSize ?? "",
      contactName: contact.contactName ?? "",
      email: contact.email,
      emailIsGeneric: contact.emailIsGeneric,
      sourceUrl: contact.sourceUrl,
      notes: contact.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!editingId) return;
    setBusy("save");
    try {
      if (editingId === "new") {
        await postJson("/api/admin/counselor-contacts", "POST", toPayload(form));
        toast("Contact created");
      } else {
        await postJson(`/api/admin/counselor-contacts/${editingId}`, "PATCH", toPayload(form));
        toast("Contact updated");
      }
      cancelEdit();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(contact: CounselorContact) {
    if (!window.confirm(`Delete the contact for "${contact.schoolName}"? This can't be undone.`)) return;
    setBusy(contact.id);
    try {
      await postJson(`/api/admin/counselor-contacts/${contact.id}`, "DELETE", {});
      toast("Contact deleted");
      if (editingId === contact.id) cancelEdit();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete contact");
    } finally {
      setBusy(null);
    }
  }

  async function handleStatusChange(contact: CounselorContact, status: CounselorOutreachStatus) {
    setBusy(`status:${contact.id}`);
    try {
      await postJson(`/api/admin/counselor-contacts/${contact.id}/status`, "POST", { status });
      toast("Status updated");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  const formValid =
    form.schoolName.trim() && form.country.trim() && form.cityRegion.trim() && form.email.trim() && form.sourceUrl.trim();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
        {editingId ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">School name</label>
                <Input value={form.schoolName} onChange={(e) => setForm((f) => ({ ...f, schoolName: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Country</label>
                <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">City/region</label>
                <Input value={form.cityRegion} onChange={(e) => setForm((f) => ({ ...f, cityRegion: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">School size</label>
                <Select
                  value={form.schoolSize}
                  onChange={(e) => setForm((f) => ({ ...f, schoolSize: e.target.value as SchoolSize | "" }))}
                >
                  <option value="">Not specified</option>
                  <option value="BIG">Big</option>
                  <option value="SMALL">Small</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Counselor/contact name (optional)</label>
                <Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted">Source URL (required -- where the email was observed)</label>
                <Input value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.emailIsGeneric}
                  onChange={(e) => setForm((f) => ({ ...f, emailIsGeneric: e.target.checked }))}
                />
                Generic school address (info@/office@), not counselor-specific
              </label>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted">Notes (optional)</label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={busy === "save" || !formValid}>
                {busy === "save" ? "Saving..." : editingId === "new" ? "Create contact" : "Save changes"}
              </Button>
              <Button size="sm" variant="secondary" onClick={cancelEdit} disabled={busy === "save"}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" onClick={startCreate}>
              + New contact
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <Select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="w-auto">
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as CounselorOutreachStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <div className="flex gap-1 text-xs text-muted">
          <span className="pr-1">Sort:</span>
          {(["country", "schoolName", "createdAt"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={`rounded px-2 py-1 hover:bg-surface-muted ${sortKey === key ? "font-semibold text-foreground" : ""}`}
            >
              {key === "country" ? "Country" : key === "schoolName" ? "School" : "Date added"}
              {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Contacts ({visible.length}{visible.length !== contacts.length ? ` of ${contacts.length}` : ""})
        </h2>
        {visible.length === 0 ? (
          <p className="text-sm text-muted">No contacts match these filters.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {visible.map((contact) => (
              <div key={contact.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{contact.schoolName}</span>
                    <Badge tone="neutral">{contact.country}</Badge>
                    <Badge tone={STATUS_TONES[contact.status]}>{STATUS_LABELS[contact.status]}</Badge>
                    {contact.emailIsGeneric && <Badge tone="warning">Generic address</Badge>}
                  </div>
                  <span className="text-sm text-muted">
                    {contact.cityRegion}
                    {contact.schoolSize ? ` · ${contact.schoolSize === "BIG" ? "Big" : "Small"}` : ""}
                    {contact.contactName ? ` · ${contact.contactName}` : ""}
                  </span>
                  <span className="text-sm text-muted">{contact.email}</span>
                  <a
                    href={contact.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-hover underline dark:text-accent"
                  >
                    {contact.sourceUrl}
                  </a>
                  {contact.notes && <span className="text-xs text-muted">{contact.notes}</span>}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                  <Select
                    value={contact.status}
                    onChange={(e) => handleStatusChange(contact, e.target.value as CounselorOutreachStatus)}
                    disabled={busy === `status:${contact.id}`}
                    className="w-auto"
                  >
                    {(Object.keys(STATUS_LABELS) as CounselorOutreachStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(contact)} disabled={busy !== null}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(contact)} disabled={busy !== null}>
                      {busy === contact.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
