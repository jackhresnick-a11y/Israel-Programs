import { ImageResponse } from "next/og";
import { getSharedFolder } from "@/lib/folders";
import { lionDataUri, NAVY, CREAM, GOLD } from "@/lib/ogAssets";
import { SITE_NAME, SITE_URL } from "@/lib/siteUrl";

export const alt = "A shared program list on Israel Programs Wiki";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedFolder(token);
  if (!shared) {
    return new Response("Not Found", { status: 404 });
  }

  const count = shared.programs.length;
  const fontSize = shared.name.length > 40 ? 56 : 72;
  const names = shared.programs.slice(0, 3).map((p) => p.name);
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize, fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>{shared.name}</div>
          <div style={{ fontSize: 30, color: GOLD }}>{`${count} ${count === 1 ? "program" : "programs"}`}</div>
          {names.length > 0 && (
            <div style={{ fontSize: 26, color: CREAM, opacity: 0.8 }}>{names.join(" · ")}</div>
          )}
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
