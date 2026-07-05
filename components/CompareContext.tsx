"use client";

import { createContext, useContext, useState } from "react";
import { MAX_COMPARE } from "@/lib/compare";

type SelectedProgram = { slug: string; name: string };

type CompareContextValue = {
  selected: SelectedProgram[];
  isSelected: (slug: string) => boolean;
  toggle: (program: SelectedProgram) => void;
  remove: (slug: string) => void;
  atLimit: boolean;
};

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<SelectedProgram[]>([]);

  function toggle(program: SelectedProgram) {
    setSelected((current) => {
      if (current.some((p) => p.slug === program.slug)) {
        return current.filter((p) => p.slug !== program.slug);
      }
      if (current.length >= MAX_COMPARE) return current;
      return [...current, program];
    });
  }

  function remove(slug: string) {
    setSelected((current) => current.filter((p) => p.slug !== slug));
  }

  const value: CompareContextValue = {
    selected,
    isSelected: (slug) => selected.some((p) => p.slug === slug),
    toggle,
    remove,
    atLimit: selected.length >= MAX_COMPARE,
  };

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within a CompareProvider");
  return ctx;
}
