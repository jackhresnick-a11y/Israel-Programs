/**
 * Scholarship/college-credit/travel are real Program fields (hasScholarship,
 * hasCollegeCredit, travelType), not tags -- see the "Program details"
 * section of SearchBar. This is just the display-label map for travelType.
 *
 * Gender/affiliation/population tag grouping is driven dynamically by
 * Tag.category in the database (see lib/programs.ts's category-aware
 * OR/AND grouping and SearchBar's category clustering), not a hardcoded
 * list here.
 */
export const TRAVEL_TYPE_LABELS: Record<string, string> = {
  SINGLE_LOCATION: "Single location",
  MULTI_CITY_TOURING: "Multi-city / touring",
};
