import { ImageResponse } from "next/og";
import { blades } from "./icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** O iOS aplica os cantos arredondados sozinho, então o ícone é um quadrado cheio. */
export default function AppleIcon() {
  const scale = size.width / 32;
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: "#084734" }}>
        {blades(scale)}
      </div>
    ),
    { ...size },
  );
}
