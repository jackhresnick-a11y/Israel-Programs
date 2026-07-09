"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import MissionIcon from "@/components/MissionIcon";
import FormattedText from "@/components/FormattedText";
import { MISSION_ICONS, MISSION_ICON_LABELS, type MissionBlock } from "@/lib/missionBlocks";

export default function MissionBlocksForm({ initial }: { initial: MissionBlock[] }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<MissionBlock[]>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof MissionBlock>(index: number, key: K, value: MissionBlock[K]) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, [key]: value } : b)));
  }

  function addBlock() {
    setBlocks((prev) => [...prev, { icon: "compass", heading: "", body: "" }]);
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed to save");
      }
      router.push("/mission");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <p className="rounded-lg bg-danger-bg px-4 py-2 text-sm text-danger">{error}</p>
      )}

      {blocks.map((block, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Block {i + 1}</span>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => moveBlock(i, -1)}
                disabled={i === 0}
                className="text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveBlock(i, 1)}
                disabled={i === blocks.length - 1}
                className="text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeBlock(i)}
                disabled={blocks.length <= 1}
                className="text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Icon</span>
            <Select
              value={block.icon}
              onChange={(e) => update(i, "icon", e.target.value as MissionBlock["icon"])}
              className="w-fit"
            >
              {MISSION_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {MISSION_ICON_LABELS[icon]}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Heading (optional)</span>
            <Input
              value={block.heading}
              onChange={(e) => update(i, "heading", e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Body</span>
            <Textarea
              required
              rows={6}
              value={block.body}
              onChange={(e) => update(i, "body", e.target.value)}
            />
            <span className="text-xs text-muted">
              Wrap a phrase in **double asterisks** to bold it. Leave a blank line between paragraphs.
            </span>
          </label>

          <div className="flex items-start gap-3 rounded-lg bg-surface-muted p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-hover dark:text-accent">
              <MissionIcon icon={block.icon} className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-1">
              {block.heading && (
                <span className="font-serif text-sm font-semibold text-foreground">
                  {block.heading}
                </span>
              )}
              {block.body.split(/\n\n+/).map((paragraph, j) => (
                <p key={j} className="text-xs leading-relaxed text-foreground/80">
                  <FormattedText text={paragraph} />
                </p>
              ))}
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={addBlock}>
        Add block
      </Button>

      <Button type="submit" disabled={submitting} className="w-fit">
        {submitting ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
