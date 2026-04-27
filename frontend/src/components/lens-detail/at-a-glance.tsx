type Props = {
  apertureMin: number | null;
  apertureMax: number | null;
  focalLengthMin: number | null;
  focalLengthMax: number | null;
  weightG: number | null;
  filterSizeMm: number | null;
  diaphragmBlades: number | null;
  isPrime: boolean | null;
};

const TICKS = [14, 24, 35, 50, 85, 135, 200, 400];
const TICK_MIN = 8;
const TICK_MAX = 500;

function logScale(value: number) {
  const lo = Math.log(TICK_MIN);
  const hi = Math.log(TICK_MAX);
  return Math.max(0, Math.min(1, (Math.log(value) - lo) / (hi - lo)));
}

function ApertureSvg({ blades }: { blades: number | null }) {
  const n = Math.max(3, Math.min(blades ?? 9, 18));
  const cx = 50;
  const cy = 50;
  const r = 30;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 100" className="size-[72px] shrink-0" aria-hidden="true">
      <defs>
        <clipPath id="apclip">
          <circle cx="50" cy="50" r="44" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
      <g clipPath="url(#apclip)" fill="currentColor">
        <polygon points={pts.join(" ")} />
      </g>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--fg-mid)" strokeWidth="0.5" strokeDasharray="1 3" />
    </svg>
  );
}

export function AtAGlance(props: Props) {
  const apMin = props.apertureMin;
  const apMax = props.apertureMax;
  const focalLo = props.focalLengthMin;
  const focalHi = props.focalLengthMax ?? props.focalLengthMin;

  const apertureLabel =
    apMin != null
      ? apMax != null && apMax !== apMin
        ? `ƒ/${apMin}–${apMax}`
        : `ƒ/${apMin}`
      : "—";

  const focalKind = props.isPrime ? "prime" : focalLo != null && focalHi != null && focalLo !== focalHi ? "zoom" : focalLo ? "prime" : "—";
  const focalLabel =
    focalLo != null
      ? focalHi != null && focalHi !== focalLo
        ? `${focalLo}–${focalHi}mm`
        : `${focalLo}mm`
      : "—";

  return (
    <div className="spec-block">
      <div className="spec-head">
        <h3>At a glance</h3>
        <span className="spec-count">{focalKind} · {focalLabel}</span>
      </div>

      <div className="flex items-center gap-5 px-4 py-4.5">
        <ApertureSvg blades={props.diaphragmBlades} />
        <div className="grid flex-1 grid-cols-2 gap-3.5">
          <div>
            <div className="mono mb-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              Max aperture
            </div>
            <div className="text-[22px] font-medium leading-none -tracking-[0.02em]">{apertureLabel}</div>
          </div>
          <div>
            <div className="mono mb-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              Blades
            </div>
            <div className="text-[22px] font-medium leading-none -tracking-[0.02em]">
              {props.diaphragmBlades ?? "—"}
            </div>
          </div>
          <div>
            <div className="mono mb-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              Weight
            </div>
            <div className="text-[22px] font-medium leading-none -tracking-[0.02em]">
              {props.weightG != null ? (
                <>
                  {Math.round(props.weightG)}
                  <span className="mono ml-0.5 text-[11px] font-normal text-[var(--fg-dim)]">g</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="mono mb-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
              Filter
            </div>
            <div className="text-[22px] font-medium leading-none -tracking-[0.02em]">
              {props.filterSizeMm != null ? (
                <>
                  {props.filterSizeMm}
                  <span className="mono ml-0.5 text-[11px] font-normal text-[var(--fg-dim)]">mm</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        </div>
      </div>

      {focalLo != null && (
        <div className="border-t border-border px-4 py-4">
          <div className="mono mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-[var(--fg-dim)]">
            <span>Focal length</span>
            <span>{focalKind} · {focalLabel}</span>
          </div>
          <div className="relative mb-2 h-7 rounded-md border border-border bg-[var(--surface-soft)]">
            {/* highlighted range */}
            <div
              className="absolute inset-y-0 rounded bg-foreground opacity-90"
              style={{
                left: `${logScale(focalLo) * 100}%`,
                width: `${Math.max(logScale(focalHi!) - logScale(focalLo), 0.02) * 100}%`,
              }}
            />
            {/* ticks */}
            {TICKS.map((t) => (
              <span
                key={t}
                className="absolute top-0 h-1.5 w-px bg-[var(--fg-faint)] opacity-50"
                style={{ left: `${logScale(t) * 100}%` }}
              />
            ))}
          </div>
          <div className="mono relative h-3 text-[10px] text-[var(--fg-faint)]">
            {TICKS.map((t) => {
              const inRange = focalLo != null && focalHi != null && t >= focalLo && t <= focalHi;
              return (
                <span
                  key={t}
                  className={`absolute -translate-x-1/2 ${inRange ? "text-foreground" : ""}`}
                  style={{ left: `${logScale(t) * 100}%` }}
                >
                  {t}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
