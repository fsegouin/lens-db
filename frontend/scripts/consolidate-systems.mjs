/**
 * Mount-system consolidation.
 *
 * The `systems` table was built from the free-text "Mount" field of the
 * archived lens-db.com pages, then extended by a camera import and by the
 * DPReview watcher. That left three kinds of clutter:
 *
 *   1. The same physical mount under several names (M39 / Leica /
 *      Leica screw mount / Leica SM; Pentax 6x7 / Pentax 6×7; ...).
 *   2. Per-lens variants of one mount modelled as systems
 *      ("Leica R(3 cam, R only)", "Nikon F(Bellows)", "Contax(Inner mount)").
 *      Every lens keeps its original mount string in `specs.Mount`, so
 *      merging these loses nothing.
 *   3. Camera families that share a mount modelled as their own systems
 *      ("Yashica M42", "Ricoh K (P)", "Leotax", "Zorki").
 *
 * This script merges sources into a surviving target: lenses, cameras and
 * lens_systems rows are re-pointed, view counts are summed, an entry is
 * written to `system_redirects` so /systems/<old-slug> keeps working, and the
 * source row is deleted. Everything runs in one transaction.
 *
 * Usage (from frontend/):
 *   node scripts/consolidate-systems.mjs                # dry run, all tiers
 *   node scripts/consolidate-systems.mjs --tier A,B     # dry run, some tiers
 *   node scripts/consolidate-systems.mjs --apply        # write
 *   node scripts/consolidate-systems.mjs --apply --tier A
 *
 * Tiers:
 *   A  duplicates and mislabels of one physical mount (safe, no judgement)
 *   B  per-lens variants folded into the parent mount (bellows, cams, inner/outer)
 *   C  manufacturer camera families folded into the shared mount (M42, K, F, LTM, M)
 *   D  cosmetic: renames and manufacturer fixes on surviving rows
 *
 * Every source is pinned by id AND name; a mismatch aborts before any write.
 * Requires the `system_redirects` table (migration 0021) and DATABASE_URL.
 */

import { createPool } from "./lib/db.mjs";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

if (!process.env.DATABASE_URL) {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      const key = trimmed.slice(0, sep).trim();
      const value = trimmed.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const tierArg = args[args.indexOf("--tier") + 1];
const tiers = args.includes("--tier") ? tierArg.split(",").map((t) => t.trim().toUpperCase()) : ["A", "B", "C", "D"];

// ─── Merge map ──────────────────────────────────────────────────────────
// { tier, into: [id, name], from: [[id, name], ...], why, rename?, manufacturer?, description? }
// `manufacturer: null` clears a wrong value on the target.

const MERGES = [
  // ── Tier A: same physical mount under several names ────────────────
  {
    tier: "A",
    into: [95, "Leica screw mount"],
    from: [
      [111, "M39"],
      [426, "Leica"],
      [161, "Leica SM"],
      [402, "Voigtlander BESSA (LSM)"],
      [403, "Voigtlander Bessa (LTM)"],
    ],
    why: "M39, LSM, LTM, L39 and 'Leica' all name the 39mm × 26tpi Leica thread mount (1930). 'Leica SM' holds only screw-mount bodies; both Bessa rows are empty.",
    rename: "Leica Screw Mount (M39 / LTM)",
  },
  {
    tier: "A",
    into: [16, "Leica M"],
    from: [
      [388, "Leica M39"],
      [405, "Voigtlander BESSA (VM)"],
      [409, "Zeiss Ikon"],
      [399, "Rollei 35 RF"],
      [385, "Konica HEXAR RF"],
    ],
    why: "'Leica M39' is a DPReview mis-map: it contains Zeiss ZM, Voigtländer VM and Summilux-M lenses plus two M bodies. The others are empty M-mount camera rows.",
  },
  {
    tier: "A",
    into: [94, "Minolta/Sony A"],
    from: [
      [183, "Sony A"],
      [392, "Minolta A"],
    ],
    why: "One A-mount (Minolta 1985, Sony 2006). 'Sony A' was created by the DPReview mount map; 'Minolta A' by the camera import.",
  },
  {
    tier: "A",
    into: [53, "Pentax 6x7"],
    from: [[171, "Pentax 6×7"]],
    why: "Unicode × vs ASCII x duplicate.",
    rename: "Pentax 6×7",
  },
  {
    tier: "A",
    into: [41, "Praktisix (Pentacon Six)"],
    from: [[170, "Praktisix/Pentacon six"]],
    why: "Same breech-lock 6×6 mount; one row came from the lens import, the other from the camera import.",
    rename: "Pentacon Six (Praktisix)",
  },
  {
    tier: "A",
    into: [1, "Norita 66"],
    from: [[169, "Rittreck / Norita 66"]],
    why: "Rittreck 6×6 was renamed Norita 66; same mount.",
  },
  {
    tier: "A",
    into: [116, "Rolleiflex SLX"],
    from: [[401, "Rolleiflex SLX/6000"]],
    why: "SLX and the 6000-series share the same bayonet.",
    rename: "Rolleiflex SLX / 6000",
  },
  {
    tier: "A",
    into: [8, "Rollei QBM"],
    from: [[400, "Rolleiflex SL35"]],
    why: "The SL35 is the QBM camera line; the mount is QBM.",
  },
  {
    tier: "A",
    into: [129, "Prominent"],
    from: [[407, "Voigtlander ProminenT"]],
    why: "Same Voigtländer Prominent bayonet.",
    rename: "Voigtländer Prominent",
  },
  {
    tier: "A",
    into: [156, "Hasselblad 1600F/1000F"],
    from: [
      [76, "M60x6"],
      [383, "Hasselblad M60x6"],
    ],
    why: "M60×6 is the thread of the 1600F/1000F mount; these three rows describe one mount.",
    rename: "Hasselblad 1600F/1000F (M60×6)",
    manufacturer: "Hasselblad",
  },
  {
    tier: "A",
    into: [4, "Canon R"],
    from: [[420, "Canonflex"]],
    why: "Canonflex bodies take Canon R lenses; the mount is R.",
  },
  {
    tier: "A",
    into: [100, "M37"],
    from: [[141, "Asahiflex M37"]],
    why: "The Asahiflex is the only M37 camera.",
    rename: "Asahiflex M37",
    manufacturer: "Pentax",
  },
  {
    tier: "A",
    into: [92, "Mamiya RB67"],
    from: [[98, "Mamiya RB67 Pro-SD"]],
    why: "Pro-SD is a body revision of the RB67 system; lenses interchange.",
  },

  // ── Tier B: per-lens variants folded into the parent mount ─────────
  {
    tier: "B",
    into: [37, "Leica R"],
    from: [
      [120, "Leica R(1 cam, 2 cam, 3 cam, R only, ROM)"],
      [14, "Leica R(1 cam, 2 cam, 3 cam)"],
      [130, "Leica R(1 cam)"],
      [50, "Leica R(2 cam, 3 cam, R only, ROM)"],
      [86, "Leica R(2 cam, 3 cam, R only)"],
      [103, "Leica R(2 cam, 3 cam)"],
      [11, "Leica R(3 cam, R only, ROM)"],
      [20, "Leica R(3 cam, R only)"],
      [52, "Leica R(3 cam)"],
      [26, "Leica R(Bellows)"],
      [113, "Leica R(R only, ROM)"],
      [6, "Leica R(R only)"],
      [31, "Leica R(ROM)"],
      [72, "Leica R(w/o cams)(Bellows)"],
    ],
    why: "Cam/ROM generations are a per-lens attribute (kept in specs.Mount), not separate mounts.",
  },
  { tier: "B", into: [39, "Nikon F"], from: [[35, "Nikon F(Bellows)"]], why: "Bellows lenses are F-mount lenses. Also polluted by the DPReview mapper with modern AF-S lenses and Kodak DCS bodies." },
  { tier: "B", into: [139, "Pentax K"], from: [[102, "Pentax K(Bellows)"]], why: "Bellows lenses are K-mount lenses. Also polluted by the DPReview mapper with modern DA/D-FA lenses and K-3 III bodies." },
  { tier: "B", into: [95, "Leica screw mount"], from: [[93, "Leica screw mount(Bellows)"]], why: "Bellows variant of the screw mount." },
  { tier: "B", into: [55, "Canon FL"], from: [[77, "Canon FL(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [4, "Canon R"], from: [[133, "Canon R(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [62, "Contarex"], from: [[123, "Contarex(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [89, "Contax/Yashica"], from: [[107, "Contax/Yashica(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [21, "Hasselblad V"], from: [[71, "Hasselblad V(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [32, "Konica AR"], from: [[78, "Konica AR(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [82, "Minolta SR"], from: [[128, "Minolta SR(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [3, "Olympus OM"], from: [[65, "Olympus OM(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [124, "Topcon"], from: [[30, "Topcon(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [13, "Nikon reflex housing"], from: [[64, "Nikon reflex housing(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [116, "Rolleiflex SLX"], from: [[88, "Rolleiflex SLX(Bellows)"]], why: "Bellows variant." },
  { tier: "B", into: [41, "Praktisix (Pentacon Six)"], from: [[125, "Praktisix (Pentacon Six)(Bellows)"]], why: "Bellows variant." },
  {
    tier: "B",
    into: [127, "M42"],
    from: [
      [126, "M42(Bellows)"],
      [38, "M42(modified)"],
      [51, "M42(modified)(Bellows)"],
    ],
    why: "'Modified' M42 (open-aperture pins on SMC Takumar, EBC Fujinon, Mamiya SX, Olympus FTL) is still the M42 thread; the variant lives in specs.Mount.",
    manufacturer: null,
  },
  {
    tier: "B",
    into: [53, "Pentax 6x7"],
    from: [
      [25, "Pentax 6x7(Inner mount)"],
      [33, "Pentax 6x7(Outer mount)"],
    ],
    why: "Inner/outer bayonet is a per-lens attribute of the one 6×7 system.",
  },
  {
    tier: "B",
    into: [121, "Contax"],
    from: [
      [54, "Contax(Inner mount)"],
      [70, "Contax(Outer mount)"],
    ],
    why: "Inner/outer bayonet is a per-lens attribute of the Contax rangefinder mount.",
    rename: "Contax Rangefinder",
  },
  {
    tier: "B",
    into: [112, "Nikon S"],
    from: [
      [85, "Nikon S(Inner mount)"],
      [61, "Nikon S(Outer mount)"],
    ],
    why: "Inner/outer bayonet is a per-lens attribute of the Nikon S mount.",
  },

  // ── Tier C: camera families folded into the shared mount ───────────
  {
    tier: "C",
    into: [127, "M42"],
    from: [
      [140, "Asahi Pentax M42"],
      [378, "Chinon M42"],
      [380, "Cosina M42"],
      [422, "Edixa M42"],
      [155, "Fujica M42"],
      [390, "Mamiya CP M42"],
      [391, "Mamiya SX M42"],
      [164, "Mamiya TL/DTL M42"],
      [395, "Olympus FTL M42"],
      [173, "Petri Penta M42"],
      [177, "Ricoh M42"],
      [185, "Yashica M42"],
      [411, "Zenit M42"],
      [175, "Contax/Praktica"],
      [153, "Exakta Twin TL"],
    ],
    why: "All are M42 bodies and the lenses sold with them. 'Contax/Praktica' holds Praktica M42 bodies (nova B, LTL 3, VLC 2) and CZJ lenses; the Exakta Twin TL is an M42 camera.",
  },
  {
    tier: "C",
    into: [139, "Pentax K"],
    from: [
      [377, "Chinon K"],
      [379, "Cosina K"],
      [398, "Ricoh K"],
      [178, "Ricoh K (P)"],
      [410, "Zenit K"],
    ],
    why: "K-mount bodies by other makers. (Ricoh P lenses have an extra pin that can jam on Pentax AF bodies; that caveat belongs on the lens, not on a separate system.)",
  },
  {
    tier: "C",
    into: [39, "Nikon F"],
    from: [
      [157, "Kiev-17/19/20"],
      [374, "Almaz-103"],
    ],
    why: "Soviet F-mount bodies and their N-suffix lenses.",
  },
  {
    tier: "C",
    into: [121, "Contax"],
    from: [[158, "Kiev-II/III/4/5"]],
    why: "Kiev rangefinders are Contax II/III clones with the same bayonet.",
  },
  {
    tier: "C",
    into: [112, "Nikon S"],
    from: [[404, "Voigtlander BESSA (SC)"]],
    why: "Empty row for the Nikon S-mount Bessa.",
  },
  {
    tier: "C",
    into: [16, "Leica M"],
    from: [
      [166, "Minolta CLE"],
      [162, "Leica CL"],
    ],
    why: "M-mount bodies.",
  },
  {
    tier: "C",
    into: [95, "Leica screw mount"],
    from: [
      [146, "Canon S (LSM)"],
      [389, "Leotax"],
      [393, "Nicca/Yashica"],
      [433, "Tanack"],
      [154, "FED"],
      [167, "Zorki"],
      [165, "Minolta-35"],
      [421, "Corfield Periflex"],
    ],
    why: "Leica-thread camera families and the LTM lenses sold with them. Canon 'S' is Canon's name for its LTM bodies. (Zenit M39 is NOT included: same thread, different register.)",
  },
  {
    tier: "C",
    into: [99, "Deckel"],
    from: [[406, "Voigtlander Bessamatic/Ultramatic"]],
    why: "Bessamatic/Ultramatic use the Deckel (DKL) bayonet; row is empty.",
  },
  {
    tier: "C",
    into: [41, "Praktisix (Pentacon Six)"],
    from: [[159, "Kiev 6S/60"]],
    why: "Kiev 6S/60 use the Pentacon Six breech-lock mount.",
  },
];

// ── Tier D: fixes on surviving rows that have nothing to merge ────────
const FIXES = [
  { id: 60, name: "Interchangeable mount", manufacturer: null, why: "Generic bucket, not Tamron." },
  { id: 118, name: "Interchangeable mount (T)", manufacturer: null, rename: "T-mount (T2)", why: "T-mount is an industry standard, not Tamron's." },
  { id: 15, name: "Interchangeable mount (YS)", manufacturer: "Sigma", rename: "Sigma YS", why: "YS was Sigma's system; 'Yashica' was a guess." },
  { id: 47, name: "Interchangeable mount (Adaptall)", rename: "Tamron Adaptall", why: "Name the system after its owner." },
  { id: 56, name: "Interchangeable mount (Adaptall-2)", rename: "Tamron Adaptall-2", why: "Name the system after its owner." },
  { id: 49, name: "Interchangeable mount (Adapt-A-Matic)", rename: "Tamron Adapt-A-Matic", why: "Name the system after its owner." },
  { id: 7, name: "Interchangeable mount (T-4)", rename: "T-4 (Vivitar / Soligor)", manufacturer: null, why: "T-4 was Sigma-made for Vivitar and Soligor." },
  { id: 74, name: "Interchangeable mount (U/S)", rename: "Soligor U/S", why: "Name the system after its owner." },
  { id: 106, name: "Interchangeable mount (Unidapter Auto)", rename: "Soligor Unidapter Auto", why: "Unidapter was Soligor's system." },
  { id: 22, name: "Interchangeable mount (Unidapter)", rename: "Soligor Unidapter", why: "Unidapter was Soligor's system." },
  { id: 434, name: "Zenit M39", rename: "Zenit M39 (SLR)", why: "Make clear this is the 45.2mm-register SLR thread, not Leica's." },
  { id: 412, name: "Micro Four Thirds", manufacturer: "Olympus / Panasonic", why: "Joint standard." },
  { id: 413, name: "Four Thirds", manufacturer: "Olympus / Kodak", why: "Joint standard." },
  { id: 109, name: "Leica L", manufacturer: "L-Mount Alliance", why: "Shared by Leica, Sigma, Panasonic and others." },
];

// ─── Helpers ────────────────────────────────────────────────────────────

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function loadSystems(sql) {
  const rows = await sql`select id, name, slug, manufacturer, view_count from systems`;
  return new Map(rows.map((r) => [r.id, r]));
}

async function counts(sql, id) {
  const [l] = await sql`select count(*)::int c from lenses where system_id = ${id}`;
  const [c] = await sql`select count(*)::int c from cameras where system_id = ${id}`;
  const [ls] = await sql`select count(*)::int c from lens_systems where system_id = ${id}`;
  return { lenses: l.c, cameras: c.c, lensSystems: ls.c };
}

// ─── Main ───────────────────────────────────────────────────────────────

// One checked-out client so BEGIN/COMMIT and every write share a connection.
const pool = createPool(process.env.DATABASE_URL, { max: 1 });
const client = await pool.connect();
const sql = (strings, ...values) => {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) text += `$${i + 1}` + strings[i + 1];
  return client.query(text, values).then((r) => r.rows);
};
sql.unsafe = (text) => client.query(text).then((r) => r.rows);

try {
  const [{ exists }] = await sql`select to_regclass('public.system_redirects') is not null as exists`;
  if (!exists && apply) {
    console.error("system_redirects table is missing — apply migration 0021 first (pnpm db:migrate).");
    process.exit(1);
  }
  if (!exists) console.log("note: system_redirects table not present yet; --apply needs migration 0021.\n");

  const before = await loadSystems(sql);
  const selected = MERGES.filter((m) => tiers.includes(m.tier));
  const fixes = tiers.includes("D") ? FIXES : [];

  // Validate every pinned id/name before touching anything.
  const problems = [];
  const seenSources = new Set();
  // A target may already carry the rename from an earlier tier's run.
  const acceptedTargetNames = new Map();
  for (const m of MERGES) {
    const set = acceptedTargetNames.get(m.into[0]) ?? new Set();
    set.add(m.into[1]);
    if (m.rename) set.add(m.rename);
    acceptedTargetNames.set(m.into[0], set);
  }
  for (const m of selected) {
    const target = before.get(m.into[0]);
    if (!target) problems.push(`target ${m.into[0]} (${m.into[1]}) not found`);
    else if (!acceptedTargetNames.get(m.into[0]).has(target.name)) problems.push(`target ${m.into[0]} is "${target.name}", expected "${m.into[1]}"`);
    for (const [id, name] of m.from) {
      const src = before.get(id);
      if (!src) problems.push(`source ${id} (${name}) not found`);
      else if (src.name !== name) problems.push(`source ${id} is "${src.name}", expected "${name}"`);
      if (seenSources.has(id)) problems.push(`source ${id} listed twice`);
      seenSources.add(id);
      if (id === m.into[0]) problems.push(`source ${id} equals its target`);
    }
  }
  for (const f of fixes) {
    const row = before.get(f.id);
    if (!row) problems.push(`fix target ${f.id} (${f.name}) not found`);
    else if (row.name !== f.name) problems.push(`fix target ${f.id} is "${row.name}", expected "${f.name}"`);
  }
  // A target of one merge must not be a source of another in the same run.
  for (const m of selected) if (seenSources.has(m.into[0])) problems.push(`system ${m.into[0]} is both a target and a source`);

  if (problems.length) {
    console.error("Refusing to run — the database does not match the merge map:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"} — tiers ${tiers.join(",")} — ${selected.length} merge groups, ${selected.reduce((n, m) => n + m.from.length, 0)} source systems, ${fixes.length} fixes`);
  console.log(`systems before: ${before.size}\n`);

  let movedLenses = 0, movedCameras = 0, movedLinks = 0;

  const run = async (tx) => {
    for (const m of selected) {
      const target = before.get(m.into[0]);
      console.log(`[${m.tier}] → #${target.id} ${target.name}${m.rename ? ` (rename → "${m.rename}")` : ""}`);
      for (const [id] of m.from) {
        const src = before.get(id);
        const c = await counts(tx, id);
        movedLenses += c.lenses; movedCameras += c.cameras; movedLinks += c.lensSystems;
        console.log(`      ← #${id} ${src.name}  [${c.lenses} lenses, ${c.cameras} cameras, ${c.lensSystems} links, ${src.view_count ?? 0} views]`);
        if (!apply) continue;

        await tx`update lenses set system_id = ${target.id} where system_id = ${id}`;
        await tx`update cameras set system_id = ${target.id} where system_id = ${id}`;
        await tx`insert into lens_systems (lens_id, system_id)
                 select lens_id, ${target.id} from lens_systems where system_id = ${id}
                 on conflict do nothing`;
        await tx`delete from lens_systems where system_id = ${id}`;
        await tx`update systems set view_count = coalesce(view_count, 0) + ${src.view_count ?? 0} where id = ${target.id}`;
        // Old slug → target, and anything that already redirected to the source follows it.
        await tx`insert into system_redirects (old_slug, system_id) values (${src.slug}, ${target.id})
                 on conflict (old_slug) do update set system_id = excluded.system_id`;
        await tx`update system_redirects set system_id = ${target.id} where system_id = ${id}`;
        await tx`delete from systems where id = ${id}`;
      }
      if (apply && (m.rename || m.manufacturer !== undefined)) {
        if (m.rename && target.name !== m.rename) {
          const newSlug = slugify(m.rename);
          if (newSlug !== target.slug) {
            await tx`insert into system_redirects (old_slug, system_id) values (${target.slug}, ${target.id})
                     on conflict (old_slug) do update set system_id = excluded.system_id`;
          }
          await tx`delete from system_redirects where old_slug = ${newSlug}`;
          await tx`update systems set name = ${m.rename}, slug = ${newSlug} where id = ${target.id}`;
        }
        if (m.manufacturer !== undefined) await tx`update systems set manufacturer = ${m.manufacturer} where id = ${target.id}`;
      }
      console.log(`      why: ${m.why}\n`);
    }

    for (const f of fixes) {
      const row = before.get(f.id);
      const bits = [];
      if (f.rename) bits.push(`name "${row.name}" → "${f.rename}"`);
      if (f.manufacturer !== undefined) bits.push(`manufacturer "${row.manufacturer}" → "${f.manufacturer}"`);
      console.log(`[D] #${f.id} ${bits.join("; ")}\n      why: ${f.why}`);
      if (!apply) continue;
      if (f.rename) {
        const newSlug = slugify(f.rename);
        if (newSlug !== row.slug) {
          await tx`insert into system_redirects (old_slug, system_id) values (${row.slug}, ${f.id})
                   on conflict (old_slug) do update set system_id = excluded.system_id`;
        }
        await tx`delete from system_redirects where old_slug = ${newSlug}`;
        await tx`update systems set name = ${f.rename}, slug = ${newSlug} where id = ${f.id}`;
      }
      if (f.manufacturer !== undefined) await tx`update systems set manufacturer = ${f.manufacturer} where id = ${f.id}`;
    }
  };

  if (apply) {
    await sql.unsafe("BEGIN");
    try {
      await run(sql);
      await sql.unsafe("COMMIT");
    } catch (err) {
      await sql.unsafe("ROLLBACK");
      throw err;
    }
  } else {
    await run(sql);
  }

  const after = await loadSystems(sql);
  console.log(`\nmoved: ${movedLenses} lenses, ${movedCameras} cameras, ${movedLinks} lens_systems links`);
  console.log(`systems after: ${after.size}${apply ? "" : " (unchanged — dry run)"}; would be ${before.size - selected.reduce((n, m) => n + m.from.length, 0)} after apply`);
  if (!apply) console.log("\nRe-run with --apply to write. ISR pages for /systems refresh on their own schedule.");
} finally {
  client.release();
  await pool.end();
}
