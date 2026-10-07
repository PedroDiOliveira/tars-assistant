import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** O iOS aplica os cantos arredondados sozinho, então o ícone é um quadrado cheio. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46d8",
          color: "#ffffff",
          fontSize: 112,
          fontWeight: 800,
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
