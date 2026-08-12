import PixelIcon from "@/components/PixelIcon";
import {
  BOTTLE,
  BUBBLE,
  BURST,
  DROPLET,
  MOON,
  MOON_ZZZ,
  NAPPY,
  POOP,
  SCALE,
  SPIT,
  STORM,
} from "@/lib/sprites";
import type { DiaperType, MomentKind } from "@/lib/types";

/**
 * The symbols, mapped to their jobs. Items rather than faces — a bottle says
 * "feed" the way no animal can — while the critters themselves live on the
 * forest floor (`components/Critters.tsx`) as scenery, not signage.
 *
 *   bottle → feeding          moon   → sleep (Zs drift off it while she's down)
 *   nappy  → diapers          scale  → weight
 *   spit-up → an arc of milk  fussy  → a little storm cloud
 */

export function BottleIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={BOTTLE} size={size} className={className} />;
}

export function MoonIcon({ size, zzz, className }: { size: number; zzz?: boolean; className?: string }) {
  return <PixelIcon sprite={zzz ? MOON_ZZZ : MOON} size={size} className={className} />;
}

export function NappyIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={NAPPY} size={size} className={className} />;
}

export function ScaleIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={SCALE} size={size} className={className} />;
}

export function BubbleIcon({ size, className }: { size: number; className?: string }) {
  return <PixelIcon sprite={BUBBLE} size={size} className={className} />;
}

const MOMENT_SPRITE = { spit_up: SPIT, fussy: STORM } as const;

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
