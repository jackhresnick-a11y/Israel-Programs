import Link from "next/link";
import Card from "@/components/ui/Card";
import type { FunnelSummary } from "@/lib/pollFunnel";

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="font-mono text-2xl font-medium tabular-nums text-foreground">{value}</span>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
    </Card>
  );
}

/**
 * The admin funnel view (poll restructure item 8) -- first-party AnalyticsEvent rows
 * only, no personal data. "Completion rate" here is deliberately the strict
 * fully-completed/opens ratio, not the lighter readiness-bar (counted) rate, since the
 * whole point of this page is answering "is the poll still too long," and reaching the
 * readiness bar (lib/pollUnlock.ts's hasReachedBucketSpread) is a much lower ask than
 * actually finishing.
 */
export default function PollFunnelSummary({ summary }: { summary: FunnelSummary }) {
  const maxStopped = Math.max(1, ...summary.dropOffByPosition.map((b) => b.stoppedCount));
  const maxUnlocked = Math.max(1, ...summary.unlocksPerWeek.map((w) => w.programsUnlocked));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Opens" value={String(summary.totalOpens)} />
        <StatTile label="Counted" value={String(summary.totalCounted)} />
        <StatTile label="Fully completed" value={String(summary.totalFullyCompleted)} />
        <StatTile label="Completion rate" value={formatRate(summary.completionRate)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Share shown" value={String(summary.share.shown)} />
        <StatTile label="Share clicked" value={String(summary.share.clicked)} />
        <StatTile label="Share click rate" value={formatRate(summary.share.rate)} />
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Programs reaching {" "}
            <span className="font-mono tabular-nums">{summary.unlocksPerWeek[0]?.programsUnlocked ?? 0}</span>
            {" "}responses per week
          </h2>
          <p className="text-sm text-muted">
            Recomputed against today&rsquo;s threshold and today&rsquo;s response statuses, so approving a
            previously-flagged response can move which week a program&rsquo;s crossing falls into. Weeks are
            UTC, Monday-start. Not the same thing as a program going public — that&rsquo;s a separate admin
            toggle, not a response-count gate.
          </p>
        </div>
        <Card className="p-4">
          {summary.unlocksPerWeek.length === 0 ? (
            <p className="text-sm text-muted">No programs have crossed the threshold yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.unlocksPerWeek.map((week) => (
                <div key={week.week} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted">{week.week}</span>
                  <div className="h-3 flex-1 bg-border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(week.programsUnlocked / maxUnlocked) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                    {week.programsUnlocked}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">Where people stop</h2>
          <p className="text-sm text-muted">
            Highest question position reached by responses that never fully completed the poll. Position is
            recomputed live at each answer, so it reflects each program&rsquo;s question order at the moment of
            that answer, not necessarily today&rsquo;s.
          </p>
        </div>
        <Card className="p-4">
          {summary.dropOffByPosition.length === 0 ? (
            <p className="text-sm text-muted">No drop-off data yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {summary.dropOffByPosition.slice(0, 20).map((bucket) => (
                <div key={bucket.position} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted">Question {bucket.position + 1}</span>
                  <div className="h-3 flex-1 bg-border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(bucket.stoppedCount / maxStopped) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                    {bucket.stoppedCount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">By program</h2>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-3 text-xs font-semibold text-muted">
            <span className="flex-1">Program</span>
            <span className="w-20 text-right">Opens</span>
            <span className="w-20 text-right">Counted</span>
            <span className="w-24 text-right">Completed</span>
            <span className="w-24 text-right">Rate</span>
            <span className="w-20 text-right">Shares</span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {summary.programs.map((row) => (
              <div key={row.programId} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Link
                  href={`/programs/${row.programSlug}`}
                  className="flex-1 truncate font-medium text-foreground hover:text-accent-hover"
                  title={row.programName}
                >
                  {row.programName}
                </Link>
                <span className="w-20 text-right tabular-nums text-foreground">{row.opens}</span>
                <span className="w-20 text-right tabular-nums text-foreground">{row.counted}</span>
                <span className="w-24 text-right tabular-nums text-foreground">{row.fullyCompleted}</span>
                <span className="w-24 text-right font-mono text-xs tabular-nums text-muted">
                  {formatRate(row.completionRate)}
                </span>
                <span className="w-20 text-right font-mono text-xs tabular-nums text-muted" title="Share button clicked / shown">
                  {row.shareClicked}/{row.shareShown}
                </span>
              </div>
            ))}
          </div>
          {summary.programs.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">No poll opens recorded yet.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
