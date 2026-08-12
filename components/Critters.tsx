import PixelIcon from "@/components/PixelIcon";
import {
  BUTTERFLY_A,
  BUTTERFLY_B,
  FOX_WALK_A,
  FOX_WALK_B,
  HEDGEHOG,
  HEDGEHOG_B,
  OWL,
  OWL_ASLEEP,
  RABBIT_HOP_A,
  RABBIT_HOP_B,
  type Sprite,
} from "@/lib/sprites";

/**
 * The forest floor: a strip of grass with the critters going about their day.
 *
 * Pure scenery — `aria-hidden`, no pointer events, and all of it CSS keyframes
 * (see globals.css) so nothing re-renders and nothing ticks. Each walker is
 * two sprite frames hard-swapped `steps(1)`, the way an 8-bit game animates,
 * while the wrapper drifts across the strip; the fox trots right, the rabbit
 * hops left, the hedgehog trundles along behind, a butterfly wanders overhead,
 * and the owl sits at the edge and blinks. Negative delays mean everyone is
 * already mid-stroll when the screen opens rather than queueing at the edge.
 *
 * Reduced motion parks everyone at their inline `left` and stops the frame
 * swaps — still a woodland, just a very calm one.
 */
export default function CritterStrip() {
  return (
    <div
      className="critter-strip relative -mx-5 h-14 shrink-0 overflow-hidden"
      aria-hidden
    >
      <Walker a={FOX_WALK_A} b={FOX_WALK_B} size={32} dur="38s" delay="-3s" park="18%" bottom={5} />
      <Walker
        a={RABBIT_HOP_A}
        b={RABBIT_HOP_B}
        size={26}
        dur="47s"
        delay="-28s"
        park="58%"
        bottom={5}
        reverse
        hop
      />
      <Walker a={HEDGEHOG} b={HEDGEHOG_B} size={24} dur="64s" delay="-40s" park="38%" bottom={4} />
      <Walker
        a={BUTTERFLY_A}
        b={BUTTERFLY_B}
        size={18}
        dur="29s"
        delay="-6s"
        park="75%"
        bottom={26}
        frameDur="0.34s"
        flutter
      />

      {/* The owl doesn't walk anywhere. Owls don't. */}
      <span className="absolute bottom-[5px] right-3 block" style={{ width: 26, height: 26 }}>
        <span className="blink-a absolute inset-0">
          <PixelIcon sprite={OWL} size={26} />
        </span>
        <span className="blink-b absolute inset-0">
          <PixelIcon sprite={OWL_ASLEEP} size={26} />
        </span>
      </span>
    </div>
  );
}

function Walker({
  a,
  b,
  size,
  dur,
  delay,
  park,
  bottom,
  reverse,
  hop,
  flutter,
  frameDur,
}: {
  a: Sprite;
  b: Sprite;
  size: number;
  /** One full crossing of the strip. */
  dur: string;
  /** Negative, so the walk is already underway on load. */
  delay: string;
  /** Where to stand when prefers-reduced-motion parks the animation. */
  park: string;
  bottom: number;
  reverse?: boolean;
  hop?: boolean;
  flutter?: boolean;
  frameDur?: string;
}) {
  return (
    <span
      className="stroll absolute block"
      style={{
        left: park,
        bottom,
        width: size,
        height: size,
        animationDuration: dur,
        animationDelay: delay,
        animationDirection: reverse ? "reverse" : undefined,
        ["--frame-dur" as string]: frameDur,
      }}
    >
      {/* The flip lives on its own layer: the hop/flutter animations own the
          `transform` property on theirs, and would silently squash an inline
          scaleX(-1) sharing the element. */}
      <span
        className="relative block h-full w-full"
        style={reverse ? { transform: "scaleX(-1)" } : undefined}
      >
        <span className={`relative block h-full w-full ${hop ? "hop" : ""} ${flutter ? "flutter" : ""}`}>
          <span className="frame-a absolute inset-0">
            <PixelIcon sprite={a} size={size} />
          </span>
          <span className="frame-b absolute inset-0">
            <PixelIcon sprite={b} size={size} />
          </span>
        </span>
      </span>
    </span>
  );
}
