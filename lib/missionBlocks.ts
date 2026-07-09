/**
 * Split out from lib/mission.ts because that file also exports functions that
 * import lib/siteContent.ts (which pulls in lib/prisma.ts, and therefore
 * `pg` -- fine for server components/routes, but MissionBlocksForm.tsx is a
 * "use client" component that only needs these types/constants/schema, and
 * bundling `pg` into the client build fails (it needs Node built-ins like
 * `tls`). Same split as lib/tagTints.ts vs lib/tags.ts.
 */
import { z } from "zod";

export const MISSION_ICONS = ["compass", "people", "map-pin", "pencil"] as const;
export type MissionIcon = (typeof MISSION_ICONS)[number];

export const MISSION_ICON_LABELS: Record<MissionIcon, string> = {
  compass: "Compass",
  people: "People / community",
  "map-pin": "Map pin",
  pencil: "Pencil / edit",
};

export type MissionBlock = {
  icon: MissionIcon;
  heading: string;
  body: string;
};

const missionBlockSchema = z.object({
  icon: z.enum(MISSION_ICONS),
  heading: z.string().trim().max(120),
  body: z.string().trim().min(1).max(5000),
});

export const missionBlocksSchema = z.array(missionBlockSchema).min(1).max(12);

/** Parses the stored `missionBlocks` JSON; malformed/missing data degrades to null. */
export function parseMissionBlocks(raw: string | null): MissionBlock[] | null {
  if (!raw) return null;
  try {
    return missionBlocksSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
