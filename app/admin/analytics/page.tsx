import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { getAnalyticsSummary } from "@/lib/analytics";
import PageContainer from "@/components/ui/PageContainer";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";

export default async function AdminAnalyticsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const summary = await getAnalyticsSummary();

  return (
    <PageContainer width="narrow" className="gap-10">
      <PageHeader
        title="Usage analytics"
        description="Search and filter activity, last 30 days. No user identifiers are collected."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Top filters
        </h2>
        {summary.topFilters.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            No filter activity yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {summary.topFilters.map((f) => (
              <div key={`${f.kind}:${f.value}`} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{f.kind}</Badge>
                  <span className="text-sm text-foreground">{f.value}</span>
                </div>
                <span className="text-sm tabular-nums text-muted">{f.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Top searches
        </h2>
        {summary.topSearches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            No searches yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {summary.topSearches.map((s) => (
              <div key={s.q} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-foreground">
                  {s.q}
                  {s.zeroResultShare > 0 && (
                    <span className="ml-2 text-xs text-muted">
                      ({Math.round(s.zeroResultShare * 100)}% zero-result)
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums text-muted">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Zero-result searches
        </h2>
        <p className="text-sm text-muted">
          Queries that returned nothing — a signal for content gaps.
        </p>
        {summary.zeroResultSearches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            No zero-result searches yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {summary.zeroResultSearches.map((s) => (
              <div key={s.q} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm text-foreground">{s.q}</span>
                <span className="text-sm tabular-nums text-muted">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Events per day
        </h2>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {summary.perDay.map((d) => (
            <div key={d.date} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm text-foreground">{d.date}</span>
              <span className="text-sm tabular-nums text-muted">
                {d.searches} searches · {d.filterUses} filter uses
              </span>
            </div>
          ))}
        </div>
      </section>
    </PageContainer>
  );
}
