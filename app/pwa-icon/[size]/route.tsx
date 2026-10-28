import { ImageResponse } from "next/og";

const SIZES = new Set([192, 512]);

/** PWA 아이콘 (파란 바탕 + 상자 모양). 192 / 512 */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not Found", { status: 404 });
  const box = size * 0.5;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#315eea" }}>
        <div
          style={{
            width: box,
            height: box,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `${size * 0.04}px solid #ffffff`,
            borderRadius: size * 0.08,
          }}
        >
          <div style={{ width: box * 0.5, height: size * 0.04, background: "#ffffff" }} />
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } }
  );
}
