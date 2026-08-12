import type { Sprite } from "@/lib/sprites";

/**
 * Draws a sprite as SVG rects, one per horizontal run of same-coloured pixels.
 *
 * SVG rather than <canvas> or an image file: it scales to any size the layout
 * asks for, `crispEdges` keeps the pixels square instead of smearing them, and
 * there are no binary assets to check in. A 16×16 sprite comes out around
 * fifty rects — nothing, even with a whole timeline of them.
 *
 * `label` promotes the icon to an image for screen readers; without it the
 * icon is decoration and hidden, with the adjacent text doing the talking —
 * exactly how the emojis these replace were treated.
 */
export default function PixelIcon({
  sprite,
  size,
  label,
  className,
}: {
  sprite: Sprite;
  size: number;
  label?: string;
  className?: string;
}) {
  const h = sprite.art.length;
  const w = sprite.art[0]?.length ?? 0;

  const rects: { x: number; y: number; len: number; fill: string }[] = [];
  sprite.art.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x];
      if (ch === ".") {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < w && row[x + len] === ch) len++;
      rects.push({ x, y, len, fill: sprite.palette[ch] ?? "#f0f" });
      x += len;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.len} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
