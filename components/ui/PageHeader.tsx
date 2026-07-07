type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export default function PageHeader({
  title,
  description,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-l-4 border-accent pl-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
