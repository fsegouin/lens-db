import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyDigitalBody, classifyWikiBody, DROPPED_BY_DEFAULT } from "./body-class.mjs";

/**
 * What the gap scanners are expected to keep and drop.
 *
 * Every name below is verbatim from LibRaw's camera list or a camera-wiki
 * article title. The two mistakes cost very different amounts: leaving a
 * compact in the report wastes a moment's review, while dropping an
 * interchangeable-lens body means a camera silently never reaches the site. The
 * "must survive" suite is therefore the one that matters most, and it leads.
 */

function wiki(title, ...categories) {
  return classifyWikiBody(title, categories);
}

describe("interchangeable-lens bodies must survive", () => {
  const keepers = [
    "Canon EOS D2000",
    "Hasselblad H5D-50c",
    "Kodak DCS760C",
    "Sony NEX-VG900",
    "Sony ILCE-QX1 / UMC-R10C",
    "Panasonic DMC-GM1s",
    "Panasonic AG-GH4",
    "Ricoh GXR Mount A12",
    "FujiFilm X-T1 Graphite Silver",
    "Zenit M",
    "Leica Digital-Modul-R",
  ];
  for (const name of keepers) {
    it(`keeps ${name}`, () => {
      assert.equal(classifyDigitalBody(name), "keep");
    });
  }

  it("keeps the Panasonic S1 despite Fujifilm's S1 being a bridge", () => {
    // The reason model patterns are scoped to the maker.
    assert.equal(classifyDigitalBody("Panasonic DC-S1"), "keep");
    assert.equal(classifyDigitalBody("FujiFilm S1"), "bridge");
  });

  it("keeps the Fujifilm X-T3 despite Yashica's T3 being a compact", () => {
    assert.equal(classifyDigitalBody("FujiFilm X-T3"), "keep");
    assert.equal(classifyDigitalBody("Yashica T3"), "notable-compact");
  });
});

describe("digital compacts and bridges are all out, however good", () => {
  const compacts = [
    "FujiFilm X100V",
    "Sony DSC-RX100 VII",
    "Ricoh GR III",
    "Sigma DP2 Merrill",
    "Leica Q3",
    "Panasonic DMC-LX100",
    "Canon PowerShot G7 X Mark III",
    "Nikon Coolpix A",
    "Zeiss ZX1",
    "Olympus XZ-10",
    "Sigma DP1X",
  ];
  for (const name of compacts) {
    it(`drops ${name}`, () => {
      assert.equal(classifyDigitalBody(name), "compact");
    });
  }

  const bridges = ["Panasonic DMC-FZ1000", "Sony DSC-RX10 IV", "Leica V-LUX1", "Olympus E-20", "Canon PowerShot SX70 HS"];
  for (const name of bridges) {
    it(`drops ${name} as a bridge`, () => {
      assert.equal(classifyDigitalBody(name), "bridge");
    });
  }
});

describe("premium 80s/90s film point & shoots are the one exception", () => {
  const notable = [
    "Contax T2",
    "Yashica T4",
    "Olympus mju II",
    "Nikon 35Ti",
    "Minolta TC-1",
    "Konica Hexar AF",
    "Leica Minilux",
    "Ricoh GR1s",
    "Pentax Espio Mini",
    "LOMO LC-A",
  ];
  for (const name of notable) {
    it(`keeps ${name}`, () => {
      assert.equal(classifyDigitalBody(name), "notable-compact");
    });
  }

  // Each of those names was reused for a zoom version that shares only the
  // badge. The prime is the reason the name means anything.
  const zoomVariants = ["Olympus mju II ZOOM 115", "Leica Minilux Zoom", "Fujifilm Tiara Zoom", "Konica Big Mini BM-510Z"];
  for (const name of zoomVariants) {
    it(`drops ${name}`, () => {
      assert.equal(classifyDigitalBody(name), "compact");
    });
  }
});

describe("camera-wiki classes come from the category, not the title", () => {
  it("keeps an SLR", () => {
    assert.equal(wiki("Nikon F", "Japanese 35mm SLR", "1959"), "keep");
  });

  it("keeps a folding camera for its lens", () => {
    assert.equal(wiki("Agfa Billy Record II", "German 6x9 viewfinder folding", "120 film"), "folding");
  });

  it("separates a box camera from a folding one", () => {
    assert.equal(wiki("Kodak Brownie No. 0", "American 127 film box"), "box");
  });

  it("calls a plain viewfinder camera its own class", () => {
    assert.equal(wiki("Konica Snap", "Japanese 35mm viewfinder"), "viewfinder");
  });

  it("drops an ordinary autofocus point & shoot", () => {
    assert.equal(wiki("Yashica MF-1", "Japanese 35mm autofocus"), "compact");
  });

  it("keeps a premium one from the same category", () => {
    assert.equal(wiki("Contax T2", "Japanese 35mm autofocus"), "notable-compact");
  });

  it("drops a cartridge snapshot camera whatever its shape", () => {
    // 110 and 126 existed so nobody had to focus.
    assert.equal(wiki("Agfamatic 55C", "German 126 film"), "compact");
    assert.equal(wiki("Kodak disc 3100", "American disc"), "compact");
  });

  it("keeps a cartridge camera that is genuinely an SLR", () => {
    assert.equal(wiki("Pentax auto 110", "Japanese 110 film SLR"), "keep");
  });
});

describe("the default drop set", () => {
  it("drops compacts, bridges, box cameras and non-cameras", () => {
    assert.deepEqual([...DROPPED_BY_DEFAULT].sort(), ["box", "bridge", "compact", "not-a-camera"]);
  });

  it("keeps folding, instant and viewfinder", () => {
    for (const kept of ["folding", "instant", "viewfinder", "keep", "notable-compact"]) {
      assert.ok(!DROPPED_BY_DEFAULT.has(kept), `${kept} should be kept`);
    }
  });
});
