/**
 * Controlled-vocabulary filter facets, backed by specific Tag slugs.
 * Each facet is a dedicated dropdown (like the duration filter) rather than
 * a free-form tag pill, so the UI stays discoverable even as the full tag
 * list grows past what fits on screen.
 */

export type FacetKey =
  | "gender"
  | "affiliation"
  | "scholarship"
  | "collegeCredit"
  | "travel"
  | "population";

export type FacetOption = { slug: string; label: string };

export const GENDER_OPTIONS: FacetOption[] = [
  { slug: "coed", label: "Co-ed" },
  { slug: "boys-only", label: "Boys only" },
  { slug: "girls-only", label: "Girls only" },
];

export const AFFILIATION_OPTIONS: FacetOption[] = [
  { slug: "orthodox", label: "Orthodox" },
  { slug: "chabad", label: "Chabad" },
  { slug: "conservative", label: "Conservative" },
  { slug: "reform", label: "Reform" },
  { slug: "reconstructionist", label: "Reconstructionist" },
  { slug: "pluralistic", label: "Pluralistic" },
  { slug: "secular", label: "Secular / Non-denominational" },
];

export const SCHOLARSHIP_OPTIONS: FacetOption[] = [
  { slug: "scholarships-available", label: "Scholarships / financial aid available" },
];

export const COLLEGE_CREDIT_OPTIONS: FacetOption[] = [
  { slug: "college-credit", label: "College credit available" },
];

export const TRAVEL_OPTIONS: FacetOption[] = [
  { slug: "single-location", label: "Single location" },
  { slug: "multi-city-touring", label: "Multi-city / touring" },
];

export const POPULATION_OPTIONS: FacetOption[] = [
  { slug: "israeli-anglo-mix", label: "Mixed Israeli & Anglo" },
  { slug: "anglo-only", label: "Anglo only" },
  { slug: "israeli-only", label: "Israeli only" },
];

export const FACETS: Record<FacetKey, { label: string; options: FacetOption[] }> = {
  gender: { label: "Gender mix", options: GENDER_OPTIONS },
  affiliation: { label: "Religious affiliation", options: AFFILIATION_OPTIONS },
  scholarship: { label: "Financial aid", options: SCHOLARSHIP_OPTIONS },
  collegeCredit: { label: "College credit", options: COLLEGE_CREDIT_OPTIONS },
  travel: { label: "Travel", options: TRAVEL_OPTIONS },
  population: { label: "Participant mix", options: POPULATION_OPTIONS },
};
