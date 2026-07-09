import type { MissionIcon as MissionIconType } from "@/lib/missionBlocks";

const PATHS: Record<MissionIconType, React.ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5 13 13l-3.5 1.5L11 11z" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 13.5A4.5 4.5 0 0 1 20.5 18" />
    </>
  ),
  "map-pin": (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  pencil: (
    <>
      <path d="m16.5 4.5 3 3L7 20H4v-3Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
};

export default function MissionIcon({ icon, className }: { icon: MissionIconType; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      {PATHS[icon]}
    </svg>
  );
}
