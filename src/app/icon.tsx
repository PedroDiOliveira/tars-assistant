import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Mesma geometria de components/brand/logo.tsx, desenhada em escala para o ícone do app. */
const TOPS = [4.5, 1.5, 6.5, 3.5];
const BLADE_WIDTH = 3.9;
const BLADE_HEIGHT = 24;
const GAP = 1.2;
const FIRST_X = 7.4;
const RADIUS = 1.4;

/** Centro do desenho, para encolhê-lo sem sair do meio do quadrado. */
const CENTER_X = FIRST_X + (4 * BLADE_WIDTH + 3 * GAP) / 2;
const CENTER_Y = 16;
/** No ícone do app a marca respira mais que no cabeçalho. */
const INSET = 0.68;

export function blades(scale: number) {
  return TOPS.map((top, i) => {
    const x = FIRST_X + i * (BLADE_WIDTH + GAP);
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: (CENTER_X + (x - CENTER_X) * INSET) * scale,
          top: (CENTER_Y + (top - CENTER_Y) * INSET) * scale,
          width: BLADE_WIDTH * INSET * scale,
          height: BLADE_HEIGHT * INSET * scale,
          borderRadius: RADIUS * INSET * scale,
          background: "#cef17b",
        }}
      />
    );
  });
}

export default function Icon() {
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
