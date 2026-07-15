import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/roles";

// SVG intentionally excluded -- an SVG can carry <script>/event-handler payloads that
// execute in the site's origin when served back inline, unlike the raster formats here.
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const check = await requireRole("admin");
        if (!check.ok) throw new Error("Unauthorized");

        return {
          allowedContentTypes: ALLOWED_LOGO_TYPES,
          maximumSizeInBytes: MAX_LOGO_BYTES,
          addRandomSuffix: true,
        };
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to authorize upload" },
      { status: 400 }
    );
  }
}
