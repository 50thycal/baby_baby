import { ImageResponse } from "next/og";
import { ACCENT } from "@/lib/palette";
import { FOX } from "@/lib/sprites";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** 180px canvas, 16px sprite: 8px cells leave a 26px margin all round. */
const CELL = 8;

// iOS needs a raster home-screen icon; building the fox out of divs keeps
// binary assets out of the repo and needs no font or network fetch. Satori
// only speaks flexbox, so the sprite is rows of coloured cells rather than
// SVG rects — same pixels either way.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: ACCENT,
        }}
      >
        {FOX.art.map((row, y) => (
          <div key={y} style={{ display: "flex" }}>
            {[...row].map((ch, x) => (
              <div
                key={x}
                style={{
                  width: CELL,
                  height: CELL,
                  background: ch === "." ? "transparent" : FOX.palette[ch],
                }}
              />
            ))}
          </div>
        ))}
      </div>
    ),
    size,
  );
}
