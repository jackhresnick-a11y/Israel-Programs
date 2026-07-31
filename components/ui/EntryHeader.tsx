/**
 * The signature entry-header pattern (style guide §5): title block, then a 2px brass
 * hairline BELOW it, full-bleed to the content gutter -- never a vertical bar beside
 * the heading, which overlapped the first letter of the H1 (§8.1). The Hebrew name, when
 * present, sits directly beneath the Latin name in the same family, lighter weight,
 * muted -- omitted entirely rather than a placeholder when the program has none.
 */
export default function EntryHeader({
  title,
  nameHe,
  description,
  children,
}: {
  title: string;
  nameHe?: string | null;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      {nameHe && (
        <p dir="rtl" lang="he" className="mt-0.5 font-serif text-lg font-normal text-muted">
          {nameHe}
        </p>
      )}
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {children}
      <div className="mt-4 h-0.5 bg-accent" />
    </div>
  );
}
