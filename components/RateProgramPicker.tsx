"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import { rankBySearchTerm, type Searchable } from "@/lib/programSearch";

// Same fuzzy ranker the main directory search uses -- typos resolve to the
// closest programs, ranked best-first, instead of an empty list. The heavy
// goodFor/description fields aren't shipped here, so matching runs over
// name/organization/location/tags (see app/rate/page.tsx).
type ProgramLink = Searchable & {
  id: string;
  href: string;
};

export default function RateProgramPicker({ programs }: { programs: ProgramLink[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim();
    if (!term) return programs; // no query -> full alphabetical list
    return rankBySearchTerm(programs, term);
  }, [programs, query]);

  return (
    <div className="flex flex-col gap-4">
      {programs.length > 12 && (
        <Input
          type="search"
          inputMode="search"
          placeholder="Search programs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full py-3 text-base"
          aria-label="Search programs"
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No programs close to &quot;{query}&quot;.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((program) => (
            <Card
              key={program.id}
              as={Link}
              href={program.href}
              interactive
              className="block px-4 py-4 text-base font-medium text-foreground active:translate-y-0"
            >
              {program.name}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
