const NAVY = "#1a2740";
const GOLD = "#c8912f";

/**
 * Default emblem shown at the top of the Background page until an admin
 * uploads a replacement via the Mission Emblem settings slot. Colors are
 * hardcoded (not theme CSS vars) so it reads identically in light and dark.
 */
export default function EmblemDefault({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} role="img" aria-label="Israel Program Wiki emblem">
      <defs>
        <path id="emblem-arc-top" d="M 55,205 A 145,145 0 0 1 345,205" />
        <path id="emblem-arc-bottom" d="M 345,215 A 145,145 0 0 1 55,215" />
      </defs>

      <circle cx="200" cy="200" r="190" fill={NAVY} />
      <circle cx="200" cy="200" r="178" fill="none" stroke={GOLD} strokeWidth="3" />
      <circle cx="200" cy="200" r="168" fill="none" stroke={GOLD} strokeWidth="1.5" />

      {/* Israel map silhouette (simplified) */}
      <path
        d="M198,120 L208,132 L206,148 L216,162 L214,180 L222,196 L218,214 L226,232
           L220,250 L210,262 L206,278 L196,270 L188,254 L178,240 L182,222 L172,206
           L178,188 L170,172 L176,154 L184,140 Z"
        fill={GOLD}
        opacity="0.35"
      />

      {/* Star of David */}
      <g transform="translate(200,190)">
        <polygon
          points="0,-46 13,-23 40,-23 20,-6 28,20 0,4 -28,20 -20,-6 -40,-23 -13,-23"
          fill="none"
          stroke={GOLD}
          strokeWidth="3"
        />
        <polygon
          points="0,46 -13,23 -40,23 -20,6 -28,-20 0,-4 28,-20 20,6 40,23 13,23"
          fill="none"
          stroke={GOLD}
          strokeWidth="3"
        />
      </g>

      {/* Lion of Judah (simplified rampant silhouette) */}
      <g transform="translate(200,225)" fill={GOLD}>
        <path
          d="M-36,18 C-40,4 -34,-10 -22,-18 C-24,-26 -18,-34 -8,-34
             C-2,-40 8,-40 14,-34 C24,-32 30,-24 28,-14
             C36,-10 40,0 34,10 C38,16 36,24 28,26
             L26,34 L18,34 L16,26 C8,28 -2,28 -10,24
             L-14,34 L-22,34 L-20,24 C-30,20 -36,12 -36,18 Z"
        />
        <circle cx="-2" cy="-24" r="3" fill={NAVY} />
      </g>

      <text fill={GOLD} fontFamily="Georgia, 'Times New Roman', serif" fontSize="21" fontWeight="700" letterSpacing="3">
        <textPath href="#emblem-arc-top" startOffset="50%" textAnchor="middle">
          ISRAEL PROGRAM WIKI
        </textPath>
      </text>

      <text fill={GOLD} fontFamily="Georgia, 'Times New Roman', serif" fontSize="20" fontWeight="700" direction="rtl">
        <textPath href="#emblem-arc-bottom" startOffset="50%" textAnchor="middle">
          {"ויקי תוכניות ישראל"}
        </textPath>
      </text>
    </svg>
  );
}
