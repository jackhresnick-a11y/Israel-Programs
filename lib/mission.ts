import { getSiteContent, upsertSiteContent } from "@/lib/siteContent";
import { type MissionBlock, parseMissionBlocks } from "@/lib/missionBlocks";

export {
  MISSION_ICONS,
  MISSION_ICON_LABELS,
  missionBlocksSchema,
  parseMissionBlocks,
  type MissionIcon,
  type MissionBlock,
} from "@/lib/missionBlocks";

const MISSION_BLOCKS_KEY = "missionBlocks";

export async function getMissionBlocks(): Promise<MissionBlock[] | null> {
  const raw = await getSiteContent(MISSION_BLOCKS_KEY);
  return parseMissionBlocks(raw);
}

export async function saveMissionBlocks(blocks: MissionBlock[]) {
  return upsertSiteContent(MISSION_BLOCKS_KEY, JSON.stringify(blocks));
}
