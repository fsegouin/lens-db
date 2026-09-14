import { test, describe } from "node:test";
import assert from "node:assert";
import type { HubCameraRow, HubLensRow } from "./hub-lists.ts";
import {
  EMPTY_CAMERA_FILTERS,
  EMPTY_LENS_FILTERS,
  CATALOGUE_ORDER,
  cameraFinderHref,
  facetOptions,
  filterCameras,
  filterLenses,
  hasLensFilters,
  lensFinderHref,
  mountParamsString,
  nextSort,
  parseMountParams,
  sortLenses,
} from "./mount-catalogue.ts";

let nextId = 1;
function lens(name: string, fields: Partial<HubLensRow> = {}): HubLensRow {
  return {
    id: nextId++,
    name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    brand: "Nikon",
    focalLengthMin: null,
    focalLengthMax: null,
    apertureMin: null,
    apertureMax: null,
    yearIntroduced: null,
    isZoom: false,
    isPrime: true,
    isMacro: false,
    ...fields,
  };
}

function camera(name: string, fields: Partial<HubCameraRow> = {}): HubCameraRow {
  return {
    id: nextId++,
    name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    yearIntroduced: null,
    sensorType: null,
    sensorSize: null,
    megapixels: null,
    ...fields,
  };
}

const fifty = lens("Nikon AF-S Nikkor 50mm f/1.4G", { focalLengthMin: 50, focalLengthMax: 50, apertureMin: 1.4, yearIntroduced: 2008 });
const oneThirtyFive = lens("Nikon AF DC-Nikkor 135mm f/2D", { focalLengthMin: 135, focalLengthMax: 135, apertureMin: 2, yearIntroduced: 1995 });
const standardZoom = lens("Sigma 24-70mm f/2.8 EX DG", { brand: "Sigma", focalLengthMin: 24, focalLengthMax: 70, apertureMin: 2.8, isZoom: true, isPrime: false, yearIntroduced: 2003 });
const macro = lens("Tamron SP 90mm f/2.8 Di Macro", { brand: "Tamron", focalLengthMin: 90, focalLengthMax: 90, apertureMin: 2.8, isMacro: true });
const unknown = lens("Nikon Series E zoom");
const all = [fifty, oneThirtyFive, standardZoom, macro, unknown];

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("filterLenses", () => {
  test("keeps every lens with no filters", () => {
    assert.deepEqual(filterLenses(all, EMPTY_LENS_FILTERS), all);
  });

  test("searches the way /lenses does, so 35 does not match 135mm", () => {
    assert.deepEqual(names(filterLenses(all, { ...EMPTY_LENS_FILTERS, q: "50 1.4" })), [fifty.name]);
    assert.deepEqual(filterLenses(all, { ...EMPTY_LENS_FILTERS, q: "35" }), []);
  });

  test("a focal range keeps lenses whose whole range sits inside it", () => {
    const rows = filterLenses(all, { ...EMPTY_LENS_FILTERS, minFocal: "35", maxFocal: "100" });
    assert.deepEqual(names(rows), [fifty.name, macro.name]);
  });

  test("a bound leaves out lenses with no value, as the SQL comparison does", () => {
    assert.ok(!filterLenses(all, { ...EMPTY_LENS_FILTERS, maxFocal: "1000" }).includes(unknown));
  });

  test("aperture bounds apply to the widest aperture", () => {
    const rows = filterLenses(all, { ...EMPTY_LENS_FILTERS, maxAperture: "2" });
    assert.deepEqual(names(rows), [fifty.name, oneThirtyFive.name]);
  });

  test("an unparseable number is ignored rather than matching nothing", () => {
    assert.equal(filterLenses(all, { ...EMPTY_LENS_FILTERS, minFocal: "abc" }).length, all.length);
  });

  test("type and brand narrow together", () => {
    assert.deepEqual(names(filterLenses(all, { ...EMPTY_LENS_FILTERS, type: "zoom" })), [standardZoom.name]);
    assert.deepEqual(names(filterLenses(all, { ...EMPTY_LENS_FILTERS, type: "macro" })), [macro.name]);
    assert.deepEqual(filterLenses(all, { ...EMPTY_LENS_FILTERS, type: "zoom", brand: "Nikon" }), []);
  });

  test("whitespace alone is not an active filter", () => {
    assert.equal(hasLensFilters({ ...EMPTY_LENS_FILTERS, q: "  " }), false);
    assert.equal(hasLensFilters({ ...EMPTY_LENS_FILTERS, brand: "Sigma" }), true);
  });
});

describe("filterCameras", () => {
  test("matches sensor size exactly", () => {
    const rows = [camera("Nikon D850", { sensorSize: "Full frame" }), camera("Nikon D500", { sensorSize: "APS-C" })];
    assert.deepEqual(names(filterCameras(rows, { ...EMPTY_CAMERA_FILTERS, sensorSize: "APS-C" })), ["Nikon D500"]);
    assert.deepEqual(names(filterCameras(rows, { ...EMPTY_CAMERA_FILTERS, q: "d850" })), ["Nikon D850"]);
  });
});

describe("sortLenses", () => {
  test("the catalogue order is the name sort, and descending reverses it", () => {
    assert.deepEqual(sortLenses(all, CATALOGUE_ORDER), all);
    assert.deepEqual(sortLenses(all, { key: "name", order: "desc" }), [...all].reverse());
  });

  test("unknown values go last in both directions", () => {
    for (const order of ["asc", "desc"] as const) {
      const years = sortLenses(all, { key: "year", order }).map((l) => l.yearIntroduced);
      assert.deepEqual(years.slice(-2), [null, null]);
    }
  });

  test("ties keep catalogue order", () => {
    const rows = sortLenses(all, { key: "aperture", order: "asc" });
    assert.deepEqual(names(rows).slice(2, 4), [standardZoom.name, macro.name]);
  });
});

describe("nextSort", () => {
  test("year starts newest first, other columns ascending, and a repeat click flips", () => {
    assert.deepEqual(nextSort(CATALOGUE_ORDER, "year"), { key: "year", order: "desc" });
    assert.deepEqual(nextSort(CATALOGUE_ORDER, "brand"), { key: "brand", order: "asc" });
    assert.deepEqual(nextSort({ key: "brand", order: "asc" }, "brand"), { key: "brand", order: "desc" });
  });
});

describe("facetOptions", () => {
  test("counts values and leaves blanks out", () => {
    const values = ["Sigma", "Nikon", null, "Nikon", " "];
    assert.deepEqual(facetOptions(values, "alpha"), [
      { value: "Nikon", count: 2 },
      { value: "Sigma", count: 1 },
    ]);
    assert.deepEqual(facetOptions(["APS-C", "Full frame", "Full frame"], "count")[0], { value: "Full frame", count: 2 });
  });
});

describe("mount page URL", () => {
  test("round-trips a lens view and leaves defaults out", () => {
    const view = {
      tab: "lenses" as const,
      filters: { ...EMPTY_LENS_FILTERS, type: "prime" as const, brand: "Carl Zeiss", minFocal: "35" },
      sort: { key: "year" as const, order: "desc" as const },
    };
    const qs = mountParamsString(view);
    assert.equal(qs, "type=prime&brand=Carl+Zeiss&minFocal=35&sort=year&order=desc");
    assert.deepEqual(parseMountParams(new URLSearchParams(qs)), view);
    assert.equal(mountParamsString({ tab: "lenses", filters: EMPTY_LENS_FILTERS, sort: CATALOGUE_ORDER }), "");
  });

  test("round-trips a camera view", () => {
    const view = { tab: "cameras" as const, filters: { q: "", sensorSize: "APS-C" }, sort: CATALOGUE_ORDER };
    const qs = mountParamsString(view);
    assert.equal(qs, "tab=cameras&sensorSize=APS-C");
    assert.deepEqual(parseMountParams(new URLSearchParams(qs)), view);
  });

  test("a mount with no lenses opens on cameras without saying so in the URL", () => {
    const view = { tab: "cameras" as const, filters: { q: "leica", sensorSize: "" }, sort: CATALOGUE_ORDER };
    const qs = mountParamsString(view, "cameras");
    assert.equal(qs, "q=leica");
    assert.deepEqual(parseMountParams(new URLSearchParams(qs), "cameras"), view);
  });

  test("ignores a type or sort it does not know", () => {
    const view = parseMountParams(new URLSearchParams("type=fisheye&sort=weight&order=desc"));
    assert.ok(view.tab === "lenses");
    assert.equal(view.filters.type, "");
    assert.deepEqual(view.sort, CATALOGUE_ORDER);
  });
});

describe("links to the full filter bars", () => {
  test("carry the mount, filters and sort to /lenses", () => {
    const href = lensFinderHref("nikon-f", { ...EMPTY_LENS_FILTERS, q: "nikkor ", maxAperture: "2" }, CATALOGUE_ORDER);
    assert.equal(href, "/lenses?system=nikon-f&q=nikkor&maxAperture=2");
  });

  test("leave out the /lenses default sort, and carry any other", () => {
    assert.equal(lensFinderHref("nikon-f", EMPTY_LENS_FILTERS, { key: "year", order: "desc" }), "/lenses?system=nikon-f");
    assert.equal(lensFinderHref("nikon-f", EMPTY_LENS_FILTERS, { key: "year", order: "asc" }), "/lenses?system=nikon-f&sort=year&order=asc");
  });

  test("carry the mount and filters to /cameras", () => {
    assert.equal(cameraFinderHref("leica-m", { q: "", sensorSize: "Full frame" }), "/cameras?system=leica-m&sensorSize=Full+frame");
  });
});
