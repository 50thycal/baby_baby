import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baby Baby",
    short_name: "Baby Baby",
    description: "Feeding, sleep and diapers — logged in a couple of taps.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fdfaf5",
    theme_color: "#fdfaf5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
