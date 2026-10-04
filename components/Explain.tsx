/**
 * The "how to read this" behind a chart, folded away until asked for.
 *
 * Every explanation on the Trends screen is worth reading once and then never
 * again, and laid out in full they made the screen five phones tall. A native
 * <details> keeps them a tap away without any state to manage, opens to the
 * keyboard and screen readers for free, and matches the "How it works" fold
 * on Bets.
 */
export default function Explain({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`group text-[11px] leading-snug text-muted ${className}`}>
      <summary className="press inline-flex cursor-pointer list-none items-center gap-1 py-0.5 text-[12px] [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-semibold leading-none"
        >
          i
        </span>
        <span className="group-open:hidden">How to read this</span>
        <span className="hidden group-open:inline">Hide</span>
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}
