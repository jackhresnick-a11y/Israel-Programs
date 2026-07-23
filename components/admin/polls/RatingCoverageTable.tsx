"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import {
  MIN_RESPONSES_FOR_RATING,
  summarizeRatingCoverage,
  type RatingCoverageRow,
} from "@/lib/pollShared";

type SortKey = "count" | "name";
type SortDir = "asc" | "desc";

export default function RatingCoverageTable({ rows }: { rows: RatingCoverageRow[] }) {
  // Default: fewest responses first, so the programs needing attention are at the top.
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const summary = useMemo(() => summarizeRatingCoverage(rows), [rows]);

  const sorted = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return factor * a.name.localeCompare(b.name);
      // count: tie-break by name ascending so equal-count rows stay stable/readable.
      return factor * (a.count - b.count) || a.name.localeCompare(b.name);
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible default direction per column: names A–Z, counts low→high.
      setSortDir(key === "name" ? "asc" : "asc");
    }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          Response counts are COUNTED responses that rated <strong>Overall</strong> — the
          same measure that unlocks a public score. Programs below{" "}
          <strong>{MIN_RESPONSES_FOR_RATING}</strong> still need more responses.
        </p>
        <p className="text-sm text-foreground">
          <strong>{summary.total}</strong> published programs ·{" "}
          <span className="text-success">{summary.meeting} meet the threshold</span> ·{" "}
          <span className="text-warning">{summary.below} below</span> (need ≥{" "}
          {MIN_RESPONSES_FOR_RATING})
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2.5 text-xs font-semibold text-muted">
          <button
            type="button"
            onClick={() => toggleSort("name")}
            className="flex-1 text-left hover:text-foreground"
          >
            Program{arrow("name")}
          </button>
          <button
            type="button"
            onClick={() => toggleSort("count")}
            className="w-28 text-right hover:text-foreground"
          >
            Responses{arrow("count")}
          </button>
          <span className="w-32 text-right">Status</span>
        </div>

        <div className="flex flex-col divide-y divide-border">
          {sorted.map((row) => {
            const below = row.count < MIN_RESPONSES_FOR_RATING;
            return (
              <div
                key={row.id}
                className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", below && "bg-warning-bg/40")}
              >
                <Link
                  href={`/programs/${row.slug}`}
                  className="flex-1 truncate font-medium text-foreground hover:text-accent"
                  title={row.name}
                >
                  {row.name}
                </Link>
                <span
                  className={cn(
                    "w-28 text-right tabular-nums",
                    below ? "font-semibold text-warning" : "text-foreground"
                  )}
                >
                  {row.count}
                </span>
                <span className="flex w-32 justify-end">
                  {below ? (
                    <Badge tone="warning">
                      Needs {MIN_RESPONSES_FOR_RATING - row.count} more
                    </Badge>
                  ) : (
                    <Badge tone="success">Ready</Badge>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">No published programs.</p>
        )}
      </Card>
    </div>
  );
}
