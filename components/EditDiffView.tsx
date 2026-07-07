import type { FieldDiff, TagDiff } from "@/lib/diff";

function TokenizedText({ tokens }: { tokens: FieldDiff["tokens"] }) {
  return (
    <span>
      {tokens.map((tok, i) => {
        if (tok.type === "same") return <span key={i}>{tok.text}</span>;
        if (tok.type === "removed") {
          return (
            <del key={i} className="rounded bg-danger-bg text-danger no-underline">
              {tok.text}
            </del>
          );
        }
        return (
          <ins key={i} className="rounded bg-success-bg text-success no-underline">
            {tok.text}
          </ins>
        );
      })}
    </span>
  );
}

export default function EditDiffView({
  fieldDiffs,
  tagDiff,
}: {
  fieldDiffs: FieldDiff[];
  tagDiff: TagDiff | null;
}) {
  if (fieldDiffs.length === 0 && !tagDiff) {
    return (
      <p className="text-xs text-muted">
        No field changes detected (the edit may only affect the logo).
      </p>
    );
  }

  return (
    <dl className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3 text-xs">
      {fieldDiffs.map((diff) => (
        <div key={diff.field}>
          <dt className="font-medium text-muted">{diff.label}</dt>
          <dd className="whitespace-pre-wrap leading-relaxed">
            <TokenizedText tokens={diff.tokens} />
          </dd>
        </div>
      ))}
      {tagDiff && (
        <div>
          <dt className="font-medium text-muted">Tags</dt>
          <dd className="flex flex-wrap gap-1.5">
            {tagDiff.added.map((name) => (
              <span
                key={`added-${name}`}
                className="rounded-full bg-success-bg px-2 py-0.5 text-success"
              >
                +{name}
              </span>
            ))}
            {tagDiff.removed.map((name) => (
              <span
                key={`removed-${name}`}
                className="rounded-full bg-danger-bg px-2 py-0.5 text-danger line-through"
              >
                -{name}
              </span>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}
