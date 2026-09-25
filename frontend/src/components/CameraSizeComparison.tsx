"use client";

import Image from "next/image";
import { Attribution } from "@/components/ImageGallery";
import {
  cameraDimensionsFromSpecs,
  isCameraFrontView,
  type CameraDimensions,
  type CameraFrontView,
} from "@/lib/camera-dimensions";
import type { ComparableCamera } from "@/lib/compare-rows";
import type { ImageData } from "@/lib/image-types";

/**
 * Two camera bodies drawn to one scale, the way car sites set two cars side
 * by side.
 *
 * With a straight-on cut-out of both bodies the photos stand on a shared
 * baseline, the larger one behind. Each height is marked by a line at the
 * body's top, labelled in a gutter beside the stage, and each width by a band
 * directly under the baseline, so every figure sits against what it measures.
 * Without both photos the two dimensions are bands on their own. Depth has no
 * picture to belong to, so it is only in the sentence above. Nothing renders
 * unless both records hold readable dimensions.
 */

type Side = {
  camera: ComparableCamera;
  dims: CameraDimensions;
  view: CameraFrontView | null;
  tone: Tone;
};

type Tone = { line: string; stageLine: string; chip: string; dot: string; band: string; text: string };

// Two hues a reader can tell apart at a glance, with chip text that clears
// 4.5:1 in both themes. Deliberately not the brand accent, which marks
// identity and state rather than categories. The lines on the stage go a
// shade darker on the light theme, where a 600 crossing a faded body falls
// under 3:1.
const TONES: [Tone, Tone] = [
  {
    line: "border-sky-600 dark:border-sky-400",
    stageLine: "border-sky-700 dark:border-sky-400",
    chip: "bg-sky-700 text-white dark:bg-sky-300 dark:text-sky-950",
    dot: "bg-sky-600 dark:bg-sky-400",
    band: "bg-sky-600/10 dark:bg-sky-400/10",
    text: "text-sky-800 dark:text-sky-300",
  },
  {
    line: "border-rose-600 dark:border-rose-400",
    stageLine: "border-rose-700 dark:border-rose-400",
    chip: "bg-rose-700 text-white dark:bg-rose-300 dark:text-rose-950",
    dot: "bg-rose-600 dark:bg-rose-400",
    band: "bg-rose-600/10 dark:bg-rose-400/10",
    text: "text-rose-800 dark:text-rose-300",
  },
];

const DIFF_CHIP = "bg-zinc-600 text-white dark:bg-zinc-300 dark:text-zinc-900";

// The gutters hold the height labels clear of the photos at any width; the
// stage between them is the only part drawn to scale.
const GRID = "grid grid-cols-[4rem_minmax(0,1fr)_4rem] sm:grid-cols-[8rem_minmax(0,1fr)_8rem]";

const STAGE_MAX_REM = 22;

function mm(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} mm`;
}

function pct(part: number, whole: number): string {
  return `${(part / whole) * 100}%`;
}

/** The larger side's lead, or null when the two are within a millimetre. */
function lead(value: number, other: number): string | null {
  const diff = Math.round((value - other) * 10) / 10;
  return diff >= 1 ? `+${mm(diff)}` : null;
}

/** "8 mm narrower", or null when the two are within a millimetre. */
function difference(a: number, b: number, more: string, less: string): string | null {
  const diff = Math.round((a - b) * 10) / 10;
  if (Math.abs(diff) < 1) return null;
  return `${mm(Math.abs(diff))} ${diff > 0 ? more : less}`;
}

function summary(a: Side, b: Side): string {
  const parts = [
    difference(a.dims.widthMm, b.dims.widthMm, "wider", "narrower"),
    difference(a.dims.heightMm, b.dims.heightMm, "taller", "shorter"),
    difference(a.dims.depthMm, b.dims.depthMm, "deeper", "slimmer"),
  ].filter((p): p is string => !!p);
  if (parts.length === 0) {
    return `The ${a.camera.name} and the ${b.camera.name} measure the same to within a millimetre.`;
  }
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `The ${a.camera.name} is ${list} than the ${b.camera.name}.`;
}

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`whitespace-nowrap rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums sm:px-1.5 sm:text-xs ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * The cut-out trimmed to the camera's outline and fitted inside the box its
 * dimensions describe. The outline matches the spec ratio only to within a
 * few percent, so it is fitted rather than stretched, standing on the
 * baseline.
 */
function Cutout({ view, dims }: { view: CameraFrontView; dims: CameraDimensions }) {
  const { crop } = view;
  const outlineRatio = crop.w / crop.h;
  const specRatio = dims.widthMm / dims.heightMm;
  const fit =
    outlineRatio > specRatio
      ? { width: "100%", height: pct(specRatio, outlineRatio) }
      : { width: pct(outlineRatio, specRatio), height: "100%" };

  return (
    <div className="absolute inset-x-0 bottom-0 mx-auto overflow-hidden" style={fit}>
      <Image
        src={view.src}
        alt=""
        width={view.width}
        height={view.height}
        sizes="(min-width: 1024px) 640px, 60vw"
        className="absolute max-w-none"
        style={{
          width: pct(view.width, crop.w),
          height: pct(view.height, crop.h),
          left: `-${pct(crop.x, crop.w)}`,
          top: `-${pct(crop.y, crop.h)}`,
        }}
      />
    </div>
  );
}

/**
 * One height mark in a gutter: the line level with the body's top, and
 * hanging from it on the outer edge an axis bar beside the figure, with the
 * lead over the other body under it when this one is the taller.
 */
function HeightMark({
  side,
  other,
  align,
  bottom,
}: {
  side: Side;
  other: Side;
  align: "left" | "right";
  bottom: string;
}) {
  const gain = lead(side.dims.heightMm, other.dims.heightMm);
  const edge =
    align === "left"
      ? `left-0 items-start border-l-2 pl-1 sm:pl-1.5`
      : `right-0 items-end border-r-2 pr-1 sm:pr-1.5`;
  return (
    <div className={`absolute inset-x-0 border-t-2 ${side.tone.line}`} style={{ bottom }}>
      <div className={`absolute top-0 flex flex-col gap-1 pt-1.5 pb-0.5 ${edge} ${side.tone.line}`}>
        <span className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <Chip className={side.tone.chip}>{mm(side.dims.heightMm)}</Chip>
          <span className={`hidden text-xs sm:inline ${side.tone.text}`}>Height</span>
        </span>
        {gain && <Chip className={DIFF_CHIP}>{gain}</Chip>}
      </div>
    </div>
  );
}

/**
 * A dimension as a tinted band on the stage's scale, centred like the body
 * above it so a width band lines up with the photo it measures.
 */
function Band({
  side,
  other,
  label,
  value,
  otherValue,
  scale,
}: {
  side: Side;
  other: Side;
  label: string;
  value: number;
  otherValue: number;
  scale: number;
}) {
  const gain = lead(value, otherValue);
  return (
    <div
      className={`mx-auto flex h-7 items-center justify-center gap-1 border-t-2 sm:h-8 sm:gap-1.5 ${side.tone.line} ${side.tone.band}`}
      style={{ width: pct(value, scale) }}
      title={`${other.camera.name}: ${mm(otherValue)}`}
    >
      {gain && <Chip className={DIFF_CHIP}>{gain}</Chip>}
      <Chip className={side.tone.chip}>{mm(value)}</Chip>
      <span className={`whitespace-nowrap text-xs ${side.tone.text}`}>{label}</span>
    </div>
  );
}

/** Both sides' bands for one dimension, the longer on top. */
function BandPair({
  sides,
  label,
  pick,
  scale,
}: {
  sides: [Side, Side];
  label: string;
  pick: (d: CameraDimensions) => number;
  scale: number;
}) {
  const [a, b] = sides;
  const ordered = pick(a.dims) >= pick(b.dims) ? [a, b] : [b, a];
  return (
    <div className="space-y-1">
      {ordered.map((side) => {
        const other = side === a ? b : a;
        return (
          <Band
            key={side.camera.id}
            side={side}
            other={other}
            label={label}
            value={pick(side.dims)}
            otherValue={pick(other.dims)}
            scale={scale}
          />
        );
      })}
    </div>
  );
}

/**
 * A box room drawn in hairlines behind the stage and its gutters: a back
 * wall, with the floor and ceiling running out to the corners in
 * perspective, so the bodies stand in a space rather than float on the page.
 * `baseline` is the front edge of the floor, where the bodies stand, as a
 * percentage of the height from the top.
 */
function Room({ baseline }: { baseline: number }) {
  const wallTop = 6;
  const wallBottom = baseline - 14;
  const wallLeft = 16;
  const wallRight = 84;
  const horizon = (wallTop + wallBottom) / 2;
  const lines: [number, number, number, number][] = [
    // The back wall.
    [wallLeft, wallTop, wallRight, wallTop],
    [wallLeft, wallBottom, wallRight, wallBottom],
    [wallLeft, wallTop, wallLeft, wallBottom],
    [wallRight, wallTop, wallRight, wallBottom],
    // Ceiling and floor edges out to the corners.
    [0, 0, wallLeft, wallTop],
    [100, 0, wallRight, wallTop],
    [0, baseline, wallLeft, wallBottom],
    [100, baseline, wallRight, wallBottom],
    // The front edge of the floor, which the bodies stand on.
    [0, baseline, 100, baseline],
    // Floor boards converging on the wall, a horizon and a centre line.
    [18, baseline, 34, wallBottom],
    [82, baseline, 66, wallBottom],
    [0, horizon, 100, horizon],
    [50, wallTop, 50, baseline],
  ];
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full text-zinc-300 dark:text-zinc-700"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {lines.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

const width = (d: CameraDimensions) => d.widthMm;
const height = (d: CameraDimensions) => d.heightMm;

export default function CameraSizeComparison({
  first,
  second,
}: {
  first: ComparableCamera;
  second: ComparableCamera;
}) {
  const dimsA = cameraDimensionsFromSpecs(first.specs);
  const dimsB = cameraDimensionsFromSpecs(second.specs);
  if (!dimsA || !dimsB) return null;

  const a: Side = {
    camera: first,
    dims: dimsA,
    view: isCameraFrontView(first.frontView) ? first.frontView : null,
    tone: TONES[0],
  };
  const b: Side = {
    camera: second,
    dims: dimsB,
    view: isCameraFrontView(second.frontView) ? second.frontView : null,
    tone: TONES[1],
  };
  const sides: [Side, Side] = [a, b];
  const withPhotos = !!a.view && !!b.view;

  // Stage coordinates are millimetres, with headroom for the taller body's
  // label and a sliver of floor under the baseline.
  const maxW = Math.max(a.dims.widthMm, b.dims.widthMm);
  const maxH = Math.max(a.dims.heightMm, b.dims.heightMm);
  const stageW = maxW * 1.06;
  // The headroom keeps the taller body under the room's back wall.
  const headroom = maxH * 0.24;
  const floor = maxH * 0.03;
  const stageH = maxH + headroom + floor;

  // The bigger body stands behind, faded, so the smaller one stays visible.
  const area = (s: Side) => s.dims.widthMm * s.dims.heightMm;
  const drawOrder = area(a) >= area(b) ? [a, b] : [b, a];
  const topOf = (s: Side) => pct(floor + s.dims.heightMm, stageH);

  const credited = sides
    .map((s) =>
      s.view
        ? ((s.camera.images as ImageData[] | undefined) ?? []).find((img) => img?.src === s.view!.src)
        : undefined,
    )
    .filter((img): img is ImageData => !!img && !!(img.credit || img.license));

  return (
    <section aria-labelledby="size-heading" className="rounded-lg border border-border p-3 sm:p-6">
      <h2 id="size-heading" className="text-lg font-semibold">
        Size
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{summary(a, b)}</p>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {sides.map((side) => (
          <li key={side.camera.id} className="flex items-center gap-2">
            <span aria-hidden className={`size-2.5 rounded-full ${side.tone.dot}`} />
            {side.camera.name}
          </li>
        ))}
      </ul>

      {withPhotos ? (
        <div aria-hidden className="mx-auto mt-4" style={{ maxWidth: `calc(${STAGE_MAX_REM * (stageW / stageH)}rem + 16rem)` }}>
          <div className={`relative ${GRID}`}>
            <Room baseline={((stageH - floor) / stageH) * 100} />
            <div className="relative">
              <HeightMark side={a} other={b} align="left" bottom={topOf(a)} />
            </div>
            <div
              className="relative"
              style={{ aspectRatio: `${stageW} / ${stageH}` }}
            >
              {/* No plate: the bodies stand in the room on the page itself.
                  Each is edged with a 1px rim, dark on the light theme so a
                  silver body keeps its outline, light on the dark theme so a
                  black one does. The height lines carry across behind the
                  bodies. */}
              {sides.map((side) => (
                <div
                  key={`h-${side.camera.id}`}
                  className={`absolute inset-x-0 border-t-[1.5px] border-dashed ${side.tone.stageLine}`}
                  style={{ bottom: topOf(side) }}
                />
              ))}
              {drawOrder.map((side, i) => (
                <div
                  key={side.camera.id}
                  className={`absolute [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.3))] dark:[filter:drop-shadow(0_0_1px_rgb(255_255_255/0.6))] ${i === 0 ? "opacity-45 dark:opacity-60" : ""}`}
                  style={{
                    left: pct((stageW - side.dims.widthMm) / 2, stageW),
                    width: pct(side.dims.widthMm, stageW),
                    bottom: pct(floor, stageH),
                    height: pct(side.dims.heightMm, stageH),
                  }}
                >
                  <Cutout view={side.view!} dims={side.dims} />
                </div>
              ))}
            </div>
            <div className="relative">
              <HeightMark side={b} other={a} align="right" bottom={topOf(b)} />
            </div>
          </div>
          <div className={`${GRID} mt-1`}>
            <div className="col-start-2">
              <BandPair sides={sides} label="Width" pick={width} scale={stageW} />
            </div>
          </div>
        </div>
      ) : (
        <div aria-hidden className="mt-4 space-y-4">
          <BandPair sides={sides} label="Width" pick={width} scale={Math.max(maxW, maxH) * 1.06} />
          <BandPair sides={sides} label="Height" pick={height} scale={Math.max(maxW, maxH) * 1.06} />
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        {withPhotos
          ? "Front views drawn to one scale from the recorded body dimensions."
          : "Drawn to one scale from the recorded body dimensions."}
      </p>
      {credited.map((img) => (
        <Attribution key={img.src} image={img} className="text-left" />
      ))}
    </section>
  );
}
