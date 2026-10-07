export const LAUNCH_BACKGROUND = "#084734";

/** iPhone portrait viewports in CSS pixels, followed by the device pixel ratio. */
const IPHONE_SCREENS = [
  [320, 568, 2],
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
  [420, 912, 3],
] as const;

export const STARTUP_IMAGES = IPHONE_SCREENS.map(([width, height, scale]) => ({
  id: `${width * scale}x${height * scale}`,
  width: width * scale,
  height: height * scale,
  scale,
  media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait)`,
}));
