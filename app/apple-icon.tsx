import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS needs a raster home-screen icon; generating it from shapes here keeps
// binary assets out of the repo and needs no font or network fetch.
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
          background: "#ef9c34",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 104,
            height: 104,
            borderRadius: 52,
            background: "#fdfaf5",
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
          }}
        >
          <div style={{ width: 15, height: 15, borderRadius: 8, background: "#1f1b16" }} />
          <div style={{ width: 15, height: 15, borderRadius: 8, background: "#1f1b16" }} />
        </div>
      </div>
    ),
    size,
  );
}
