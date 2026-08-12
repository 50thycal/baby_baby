import PixelIcon from "@/components/PixelIcon";
import {
  BUBBLE,
  BURST,
  DROPLET,
  FOX,
  FROG,
  HEDGEHOG,
  OWL,
  OWL_ASLEEP,
  POOP,
  RABBIT,
  SQUIRREL,
} from "@/lib/sprites";
import type { DiaperType, MomentKind } from "@/lib/types";

/**
 * The cast, mapped to their jobs. One module owns the assignments so nothing
 * ever shows a rabbit for a feed:
 *
 *   fox      → feeding        owl      → sleep (eyes shut while she's down)
 *   rabbit   → diapers        hedgehog → weight
 *   frog     → a big spit up  squirrel → fussy fussy
 *
 * The diaper *types* stay objects rather than critters — a droplet and a poop
 * are instantly literal in a way no animal can be.
 */

export function FoxIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={FOX} size={size} className={className} />;
}

export function OwlIcon({ size, asleep, className }: { size: number; asleep?: boolean; className?: string }) {
  return <PixelIcon sprite={asleep ? OWL_ASLEEP : OWL} size={size} className={className} />;
}

export function RabbitIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={RABBIT} size={size} className={className} />;
}

export function HedgehogIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={HEDGEHOG} size={size} className={className} />;
}

export function BubbleIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={BUBBLE} size={size} className={className} />;
}

const MOMENT_SPRITE = { spit_up: FROG, fussy: SQUIRREL } as const;

export function MomentIcon({ kind, size, className }: { kind: MomentKind; size: number; className?: string }) {
  return <PixelIcon sprite={MOMENT_SPRITE[kind]} size={size} className={className} />;
}

export function DiaperIcon({ type, size, className }: { type: DiaperType; size: number; className?: string }) {
  if (type === "both") {
    // The pair, drawn slightly smaller so together they weigh the same as one.
    const s = Math.round(size * 0.72);
    return (
      <span className={`inline-flex items-center ${className ?? ""}`} aria-hidden>
        <PixelIcon sprite={DROPLET} size={s} />
        <PixelIcon sprite={POOP} size={s} />
      </span>
    );
  }
  const sprite = type === "pee" ? DROPLET : type === "poop" ? POOP : BURST;
  return <PixelIcon sprite={sprite} size={size} className={className} />;
}
