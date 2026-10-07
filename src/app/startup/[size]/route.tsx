import { ImageResponse } from "next/og";
import { LogoMark } from "@/components/brand/logo";
import { LAUNCH_BACKGROUND, STARTUP_IMAGES } from "@/lib/startup-images";

export function generateStaticParams() {
  return STARTUP_IMAGES.map(({ id }) => ({ size: id }));
}

/** iOS shows a static launch image before HTML/CSS/JavaScript can animate. */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const screen = STARTUP_IMAGES.find(({ id }) => id === size);
  if (!screen) return new Response("Unknown launch image size", { status: 404 });

  const logoSize = 112 * screen.scale;
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: LAUNCH_BACKGROUND }}>
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: screen.height * 0.46 - logoSize / 2,
            left: screen.width / 2 - logoSize / 2 - 3.5 * screen.scale,
          }}
        >
          <LogoMark width={logoSize} height={logoSize} style={{ color: "#cef17b" }} />
        </div>
      </div>
    ),
    { width: screen.width, height: screen.height },
  );
}
