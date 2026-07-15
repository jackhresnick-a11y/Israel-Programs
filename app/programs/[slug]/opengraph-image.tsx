import { ImageResponse } from "next/og";
import { getProgramShareData } from "@/lib/programs";
import { lionDataUri, NAVY, CREAM, GOLD } from "@/lib/ogAssets";
import { SITE_NAME, SITE_URL } from "@/lib/siteUrl";

export const alt = "Israel Programs Wiki program";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = await getProgramShareData(slug);

  // No fetchable preview image for unpublished programs -- matches the
  // detail page's anonymous-404 behavior.
  if (!program || program.status !== "PUBLISHED") {
    return new Response("Not Found", { status: 404 });
  }

  const name = program.name;
  const fontSize = name.length > 70 ? 44 : name.length > 40 ? 56 : 72;
  const subtitle = [program.organization, program.location].filter(Boolean).join(" · ");
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const lion = await lionDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          padding: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={lion} height={72} alt="" />
          <div style={{ fontSize: 28, color: GOLD, fontWeight: 600 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize,
              fontWeight: 700,
              color: CREAM,
              lineHeight: 1.15,
              maxHeight: 340,
              overflow: "hidden",
            }}
          >
            {name}
          </div>
          {subtitle && <div style={{ fontSize: 30, color: CREAM, opacity: 0.8 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 80, height: 4, background: GOLD }} />
          <div style={{ fontSize: 24, color: CREAM, opacity: 0.7 }}>{domain}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
