import { ImageResponse } from "next/og";
import { lionDataUri, NAVY, CREAM, GOLD } from "@/lib/ogAssets";
import { SITE_NAME } from "@/lib/siteUrl";

export const alt = "Israel Programs Wiki — a community-driven guide to Jewish Israel programs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const lion = await lionDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
          background: NAVY,
        }}
      >
        <img src={lion} height={360} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: CREAM, lineHeight: 1.1 }}>
            {SITE_NAME}
          </div>
          <div style={{ width: 120, height: 4, background: GOLD }} />
          <div style={{ fontSize: 28, color: CREAM, opacity: 0.85 }}>
            A community-driven guide to Jewish Israel programs
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
