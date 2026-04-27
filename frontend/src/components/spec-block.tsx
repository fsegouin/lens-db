import type { ReactNode } from "react";

export type SpecValue = ReactNode;

export function SpecBlock({
  title,
  rows,
}: {
  title: string;
  rows: [string, SpecValue][];
}) {
  const filled = rows.filter(
    ([, v]) => v !== null && v !== undefined && v !== false && v !== "",
  );
  if (filled.length === 0) return null;
  return (
    <div className="spec-block">
      <div className="spec-head">
        <h3>{title}</h3>
        <span className="spec-count">
          {filled.length} field{filled.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="spec-rows">
        {filled.map(([k, v], i) => (
          <div key={`${k}-${i}`} className="spec-row">
            <span className="spec-k">{k}</span>
            <span className="spec-v">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpecUnit({ children }: { children: ReactNode }) {
  return <span className="unit">{children}</span>;
}

export function SpecMono({ children }: { children: ReactNode }) {
  return <span className="mono font-normal">{children}</span>;
}
