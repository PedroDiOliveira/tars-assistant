import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Ícone provisório: letra "T" sobre a cor primária. Troque quando houver identidade visual. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#084734",
          color: "#cef17b",
          fontSize: 320,
          fontWeight: 800,
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
