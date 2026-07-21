"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";

type ProgramLink = {
  id: string;
  name: string;
  href: string;
};

const COMBINING_MARKS = /\p{Diacritic}/gu;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase();
}

export default function RateProgramPicker({ programs }: { programs: ProgramLink[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return programs;
    return programs.filter((p) => normalize(p.name).includes(term));
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
        <p className="text-sm text-muted">No programs match &quot;{query}&quot;.</p>
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
