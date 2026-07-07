export const REGION_ORDER = ["north", "south", "jerusalem", "judea", "samaria", "coast"];

export const REGION_LABELS: Record<string, string> = {
  north: "North",
  south: "South",
  jerusalem: "Jerusalem",
  judea: "Judea",
  samaria: "Samaria",
  coast: "Coast",
};

// Region -> member location-tag slugs. Selecting a region toggles all of these in the
// `tags` param; they share the "location" Tag.category so they OR together in
// buildTagAndClauses (lib/programs.ts). Edit these lists to re-home a place.
export const REGION_TO_SLUGS: Record<string, string[]> = {
  north: ["haifa", "tzfat"],
  south: ["negev", "beer-sheva", "arava-valley", "south"],
  jerusalem: ["jerusalem", "old-city", "old-city-jerusalem"],
  judea: ["gush-etzion", "hebron"],
  samaria: [],
  coast: ["tel-aviv", "herzliya", "ramat-hasharon", "hod-hasharon", "modiin"],
};
