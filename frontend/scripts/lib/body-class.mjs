/**
 * What kind of camera a gap-scanner candidate is, so the scanners can leave out
 * the ones this site does not catalogue.
 *
 * The site is built around lenses and the systems they mount on, so a body earns
 * its place by taking interchangeable lenses. Fixed-lens cameras are out, with
 * one deliberate exception: the premium 80s and 90s film point & shoots, which
 * are collected and shot for the lens on the front and are as much a part of
 * that story as any SLR. Digital compacts and bridge superzooms are not in that
 * exception — not the X100, not the RX100, not the GR — however good they are.
 *
 * Three rules keep this honest:
 *
 * 1. Default to keeping. Only an explicit pattern drops a candidate, so a body
 *    nobody thought about survives into the report where it can be seen, rather
 *    than disappearing into a filter. Unrecognised is not the same as unwanted,
 *    and the cost is asymmetric: an unwanted compact left in the report wastes a
 *    moment's review, an interchangeable-lens body dropped by a careless pattern
 *    is a camera silently missing from the site.
 * 2. Say why. Every candidate comes back with the class that decided it, and
 *    the scanners print the tally per class, so an over-eager rule shows up as a
 *    surprising count instead of a silently shorter list.
 * 3. Scope model patterns to the maker. Model designations are only unique
 *    within a brand: "S1" is a Fujifilm bridge superzoom and also Panasonic's
 *    full-frame flagship, and a bare "T3" is both a Yashica point & shoot and
 *    Fujifilm's X-T3. A global pattern for either one throws away the other.
 *
 * The `notable` lists are the deliberately subjective part of this file. They
 * are meant to be edited: adding a line is how you disagree with them.
 */

/**
 * Per-maker model rules.
 *
 * `notable` is the premium 80s/90s film compact list, checked before the drops
 * because these sit inside families that are otherwise unwanted. Dates are given
 * because the period is the point — a Canonet (1972) and a Fuji Klasse (2001)
 * are fine cameras that fall outside it, and are deliberately not here.
 *
 * `bridge` and `compact` are drop rules, and cover digital and film alike.
 */
const MAKER_RULES = [
  {
    maker: /^canon/i,
    notable: [],
    bridge: [/\bPowerShot (S[1-5] IS|SX\d|Pro ?\d+)/i],
    compact: [
      /\bPowerShot\b/i, // the whole line, G and S included
      /\bIXUS|IXY\b/i,
      /\b(Sure ?Shot|Autoboy|Prima)\b/i,
    ],
  },
  {
    maker: /^nikon/i,
    // The Ti pair (1993/94) and the L35AF "Pikaichi" (1983).
    notable: [/\b(35Ti|28Ti|L35AF)\b/i],
    bridge: [/\bCoolpix (P[56]\d\d|P9\d\d|P1000|B\d{3})\b/i],
    compact: [
      /\bCoolpix\b/i,
      /\b(Nuvis|Lite ?Touch|One ?Touch|Fun ?Touch|Sport ?Touch|Tele ?Touch|Zoom ?Touch|Nice ?Touch)\b/i,
      /\b(AF\d{3}|EF\d{3}|TW\d|W35|AW35|L\d{2}AF)/i,
    ],
  },
  {
    maker: /^sony/i,
    notable: [],
    bridge: [/\bDSC-(H\d|HX\d|RX10|R1)\b/i],
    compact: [/\bDSC-/i, /\bMavica\b/i, /\bZV-\d/i],
  },
  {
    maker: /^(fujifilm|fuji)/i,
    // The Tiara / Cardia Travel Mini (1994), a genuine cult compact of the era.
    notable: [/\b(Tiara|Cardia Travel Mini)\b/i],
    bridge: [/\b(S\d{1,4}(Pro|FS|fd|EXR|UZ|W)?|HS\d{2}\w*|SL\d{3,4}|X-S1|IS-\d)\b/i],
    compact: [
      /\bX100[A-Z]*\b/i, // a fine camera, and out of scope
      /\bX(70|10|20|30)\b|\bXF10\b|\bXQ\d\b|\bXF1\b/i,
      /\b[EFJTZ]\d{3}\w*\b/i,
      /\bFinePix\b/i,
      /\b(Klasse|Natura|Zoom Date|Silvi)\b/i, // 2000s, outside the period
    ],
  },
  {
    maker: /^panasonic/i,
    notable: [],
    bridge: [/\b(DMC|DC)-FZ\d/i],
    compact: [/\b(DMC|DC)-(LX|LC|LF|FX|FS|FP|TZ|ZS|SZ|FT|TS|XS|LZ|LS)\d/i],
  },
  {
    maker: /^olympus/i,
    // The XA (1979) and XA2 (1980), and the mju II / Stylus Epic (1997).
    notable: [/\bXA\d?\b/i, /\b(mju|µ)[- ]?(II|2)\b/i, /\bStylus Epic\b/i],
    // The E-10 and E-20 look like SLRs but their lens does not come off.
    bridge: [/\b(SP-\d{3}UZ|Stylus 1s?|C-\d{3,4}(UZ|WZ)|IS-\d|E-[12]0)/i],
    compact: [
      /\bC-\d{3,4}Z?\b/i,
      /\bSP-\d{3}\b/i,
      /\b(XZ-\d|X\d{3}|D-\d{3}Z|SH-\d|FE-\d|TG-\d|Stylus|mju|µ|Trip|Infinity|AF-\d)/i,
    ],
  },
  {
    maker: /^(leica|leitz)/i,
    // The Minilux (1995): a Summarit in a titanium compact.
    notable: [/\bMinilux\b/i],
    bridge: [/\bV-?LUX/i],
    compact: [/\b(Q\d*|D-?LUX|C-?LUX|Digilux|X ?\d|X-[EU]\b|X \(Typ|X VARIO|C \(Typ|CM\b|mini\b)/i],
  },
  {
    maker: /^ricoh/i,
    // The film GR1 line (1996-2001) and the 21mm GR21 — the reason the GR name
    // still sells. The digital GRs that inherited it are out of scope.
    notable: [/\b(GR1[sv]?|GR21)\b/i],
    bridge: [],
    compact: [/\b(GR Digital|GR\b|Caplio|Efina|R\d\b|CX\d)/i],
  },
  {
    maker: /^pentax/i,
    // The Espio Mini / UC-1 (1994).
    notable: [/\b(Espio Mini|UC-1)\b/i],
    bridge: [],
    compact: [/\b(Optio|WG-\d|Espio|IQZoom|MX-1|Zoom \d{2})/i],
  },
  {
    maker: /^sigma/i,
    notable: [],
    bridge: [],
    compact: [/\b(DP[0-3]|dp[0-3])/],
  },
  {
    maker: /^minolta/i,
    // The TC-1 (1996): a 28mm G-Rokkor in a titanium shell.
    notable: [/\bTC-1\b/i],
    bridge: [/\bDiMAGE (5|7[a-zA-Z]*|A\d)\b/i],
    compact: [/\bDiMAGE\b/i, /\b(Revio|Riva|Freedom|Capios)\b/i],
  },
  {
    maker: /^konica/i,
    // The Hexar AF (1993) and Big Mini (1989).
    notable: [/\b(Hexar AF|Hexar$|Big ?Mini)\b/i],
    bridge: [],
    compact: [/\b(Revio|Z-?up|Lexio|Recorder|KD-\d|C35 ?EF)/i],
  },
  {
    maker: /^casio/i,
    notable: [],
    bridge: [/\bEX-F[1HC]/i],
    compact: [/\bEX-|QV-/i],
  },
  {
    maker: /^kodak/i,
    notable: [],
    bridge: [/\b(Z\d{3,4}|P8\d{2}|PIXPRO AZ)/i],
    compact: [
      /\b(EasyShare|C\d{3}|V\d{3}|M\d{3}|DC\d{2,3})\b/i,
      /\b(Advantix|Instamatic|Brownie|Star|Pony|Cameo|Fling)\b/i,
    ],
  },
  {
    maker: /^contax/i,
    // The T (1984), T2 (1990) and TVS (1990). The T3 is 2001 and just outside,
    // but it is the same camera lineage and collected as part of it.
    notable: [/\b(T|T2|T3|TVS)\b/],
    bridge: [],
    compact: [],
  },
  {
    maker: /^yashica/i,
    // The T3 (1986), T4 (1990) and T5 (1994), with their Zeiss Tessar.
    notable: [/\bT[3-5]\b/],
    bridge: [],
    compact: [/\b(Zoomate|Microtec|Partner)\b/i],
  },
  {
    maker: /^(lomo|minox)/i,
    // The LC-A (1984) and the Minox 35 (1974-90s).
    notable: [/\bLC-?A\b/i, /\b35 ?(GT|GL|ML|EL|PL)?\b/i],
    bridge: [],
    compact: [],
  },
  {
    maker: /^(samsung|hp|agfaphoto|gione|creative|benq)/i,
    notable: [],
    bridge: [],
    compact: [/\b(Digimax|PhotoSmart|DC-\d|WB\d|ST\d|PL\d|EX\d|TL\d|Pro\d{3}|S8\d|L\d{2}|E\d{3})/i],
  },
  {
    maker: /^hasselblad/i,
    notable: [],
    bridge: [],
    // The Stellar and Lusso are rebadged Sony compacts and the True Zoom is a
    // phone module; the H and CFV bodies and backs are the real catalogue.
    compact: [/\b(Stellar|Lusso|True Zoom)\b/i],
  },
  {
    maker: /^(ricoh|rollei|voigtlander|voigtländer)/i,
    notable: [],
    bridge: [],
    compact: [/\b(Prego|Nano|Sprint)\b/i],
  },
];

/**
 * Devices that shoot raw but are not cameras this site catalogues: phones,
 * webcams, machine-vision and cine heads. Several come from companies that also
 * make real cameras, so they have to be caught on the model name.
 */
const NOT_A_CAMERA = [
  /\bGalaxy\b|\bXperia\b|\biPhone\b|\biPad\b|\bPixel \d|\bNexus\b/i,
  /\bAquarius|ZenPhone|Redmi|\bMi \d|OnePlus|Moto ?[GXZE]\b/i,
  /\bDigital Negative \(DNG\)/i,
  /\bPC-CAM|pix\d{3}|TXG\d|Foculus|Eyedeas|Bolex|DXO One/i,
  // Bare image sensors, machine-vision heads, scanners and drone payloads that
  // LibRaw supports because something writes their raw frames.
  /\bIMX\d{3}|KAI-\d{4}|\bMicron \d|\bMatrix \d|Sarnoff|Photron|PtGrey|\bSVS\b|STV\d{3}|\bISG \d/i,
  /\bCoolscan|QooCam|Fotoman|RoverShot|Pixelink|XCD-|GRAS-\d/i,
  /\bMavic|Osmo|Phantom\b/i,
  /\bDMC-CM1|Realme|Meizy|Lenovo|Gione|Xiaoyi|Alcatel|\ba820\b/i,
];

/**
 * Fixed-lens digital compacts from makers with no other entry here, kept
 * separate so the maker table stays about makers with a real range.
 */
const STRAY_COMPACTS = [
  /\bZeiss ZX1\b/i,
  /\bPolaroid x\d{3}\b/i,
  /\bRollei d\d{3}flex\b/i,
];

function matchesAny(patterns, name) {
  return patterns.some((p) => p.test(name));
}

/**
 * Every camera on the notable list was sold as a fast fixed prime, and that lens
 * is the whole reason for the reputation. Each name was later reused for a zoom
 * or an APS variant that shares nothing but the badge — the mju II ZOOM 115, the
 * Minilux Zoom, the Tiara Zoom, the Big Mini BM-510Z. Those are ordinary
 * compacts, so a notable match that also says zoom is sent back to the compacts.
 */
const ZOOM_VARIANT = /\bzoom\b|\bix\b|\d{2,3}Z\b/i;

/**
 * Which class a notable-list match really belongs to. A zoom variant is still a
 * compact — it just is not one of the ones worth having — so it is named as one
 * rather than falling through to be kept by default.
 */
function notableClass(rule, name) {
  if (!matchesAny(rule.notable, name)) return null;
  return ZOOM_VARIANT.test(name) ? "compact" : "notable-compact";
}

/**
 * Classify a camera by model name, for sources like LibRaw that give nothing
 * else to go on.
 *
 * Returns one of: "not-a-camera", "notable-compact", "bridge", "compact", or
 * "keep" — the last meaning an interchangeable-lens body or anything no rule
 * recognised, both of which stay in the report.
 */
export function classifyDigitalBody(name) {
  if (matchesAny(NOT_A_CAMERA, name)) return "not-a-camera";

  for (const rule of MAKER_RULES) {
    if (!rule.maker.test(name)) continue;
    const notable = notableClass(rule, name);
    if (notable) return notable;
    if (matchesAny(rule.bridge, name)) return "bridge";
    if (matchesAny(rule.compact, name)) return "compact";
  }
  if (matchesAny(STRAY_COMPACTS, name)) return "compact";
  return "keep";
}

/**
 * Classify a camera-wiki page from the categories it belongs to.
 *
 * camera-wiki names its categories "<nationality> <format> <type>" — "Japanese
 * 35mm SLR", "German 6x9 viewfinder folding", "Japanese 35mm autofocus" — so
 * the type word is a far better signal than the article title. "autofocus"
 * without "SLR" is that site's name for the point & shoot, which is exactly the
 * class where only the notable ones are wanted.
 */
export function classifyWikiBody(title, categories) {
  const list = [...categories];
  const has = (re) => list.some((c) => re.test(c));

  if (matchesAny(NOT_A_CAMERA, title)) return "not-a-camera";

  // A maker's own notable list applies whatever the categories say.
  for (const rule of MAKER_RULES) {
    if (!rule.maker.test(title)) continue;
    const notable = notableClass(rule, title);
    if (notable) return notable;
  }

  // Cartridge and disc formats existed to make cameras nobody had to focus:
  // 110, 126, disc and APS bodies are snapshot cameras whatever their shape, so
  // the format decides them before the body type gets a say. The exception is a
  // camera that is also filed as an SLR, because a few (the Pentax auto 110,
  // the Nikon Nuvis SLRs) are real cameras that happen to take a cartridge.
  if (has(/\b(110 film|126 film|disc|APS|IX240)\b/i) && !has(/\bSLR\b/i)) {
    return "compact";
  }

  // Interchangeable-lens and serious fixed-lens classics. A folding or plate
  // camera is fixed-lens but nobody would call it a compact, and its lens is
  // the reason people collect it.
  if (has(/\b(SLR|TLR|rangefinder|plate|press|monorail|field|view|stereo|panoramic|subminiature)\b/i)) {
    return "keep";
  }
  if (has(/\binstant\b/i)) return "instant";
  if (has(/\bfolding\b/i)) return "folding";
  if (has(/\bbox\b/i)) return "box";
  // "autofocus" on its own is the point & shoot category; the notable ones were
  // already taken above, so what is left is the disposable end of it.
  if (has(/\bautofocus\b/i)) return "compact";
  if (has(/\bdigital\b/i)) return classifyDigitalBody(title);
  if (has(/\bviewfinder\b/i)) return "viewfinder";
  return classifyDigitalBody(title);
}

/**
 * Classes dropped from the report unless the caller passes --all.
 *
 * Box cameras are dropped for the same reason as compacts: a meniscus lens and
 * a single shutter speed give a lens database nothing to say. Folding, instant
 * and viewfinder cameras are kept — the folders for their lenses, the instants
 * because Polaroid is missing from the site entirely, and the viewfinder class
 * because the premium 80s/90s compacts live in it alongside the ordinary ones.
 */
export const DROPPED_BY_DEFAULT = new Set(["not-a-camera", "bridge", "compact", "box"]);
