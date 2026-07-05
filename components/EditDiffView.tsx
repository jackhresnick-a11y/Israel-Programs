import type { FieldDiff, TagDiff } from "@/lib/diff";

function TokenizedText({ tokens }: { tokens: FieldDiff["tokens"] }) {
  return (
    <span>
      {tokens.map((tok, i) => {
        if (tok.type === "same") return <span key={i}>{tok.text}</span>;
        if (tok.type === "removed") {
          return (
            <del
              key={i}
              className="rounded bg-red-100 text-red-700 no-underline dark:bg-red-900/40 dark:text-red-300"
            >
              {tok.text}
            </del>
          );
        }
        return (
          <ins
            key={i}
            className="rounded bg-green-100 text-green-800 no-underline dark:bg-green-900/40 dark:text-green-300"
          >
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
      <p className="text-xs text-black/50 dark:text-white/50">
        No field changes detected (the edit may only affect the logo).
      </p>
    );
  }

  return (
    <dl className="flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs dark:border-blue-950 dark:bg-blue-950/20">
      {fieldDiffs.map((diff) => (
        <div key={diff.field}>
          <dt className="font-medium text-black/60 dark:text-white/60">{diff.label}</dt>
          <dd className="whitespace-pre-wrap leading-relaxed">
            <TokenizedText tokens={diff.tokens} />
          </dd>
        </div>
      ))}
      {tagDiff && (
        <div>
          <dt className="font-medium text-black/60 dark:text-white/60">Tags</dt>
          <dd className="flex flex-wrap gap-1.5">
            {tagDiff.added.map((name) => (
              <span
                key={`added-${name}`}
                className="rounded-full bg-green-100 px-2 py-0.5 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              >
                +{name}
              </span>
            ))}
            {tagDiff.removed.map((name) => (
              <span
                key={`removed-${name}`}
                className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 line-through dark:bg-red-900/40 dark:text-red-300"
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
