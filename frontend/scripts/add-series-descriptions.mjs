/**
 * Add descriptions to lens series that are missing them.
 *
 * Usage: node scripts/add-series-descriptions.mjs [--dry-run]
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

const descriptions = {
  '7Artisans': '7Artisans is a Chinese lens manufacturer known for affordable manual and autofocus primes for mirrorless systems. Their lineup spans from ultra-wide to portrait focal lengths, offering accessible options for Sony E, Fujifilm X, Nikon Z, and L-mount cameras.',

  'Asahi Auto-Takumar': 'The Auto-Takumar series was produced by Asahi Optical (later Pentax) from the late 1950s through the 1960s. These M42 screw-mount lenses featured an automatic diaphragm mechanism, a significant advancement over earlier preset designs.',

  'Asahi SMC Takumar': 'The SMC (Super Multi-Coated) Takumar series represented the pinnacle of Asahi Optical\'s M42 screw-mount lenses. Introduced in the early 1970s, their seven-layer multi-coating dramatically reduced flare and ghosting, setting a new standard for lens coatings.',

  'Asahi Super-Takumar': 'The Super-Takumar series was Asahi Optical\'s premium M42 screw-mount lens line from the 1960s. These lenses featured improved optical formulas and single-layer coatings, earning a strong reputation for rendering and build quality that persists among vintage lens enthusiasts.',

  'Hartblei': 'Hartblei is a Ukrainian-German manufacturer specializing in tilt-shift and super-rotator lenses for medium and large format photography. Their lenses are designed for architectural, landscape, and product photography requiring perspective control.',

  'Holga': 'Holga lenses are adapted from the iconic Holga toy camera, known for its lo-fi aesthetic with heavy vignetting, soft focus, and light leaks. Available in various mirrorless mounts, they offer a distinctly artistic, analog look for creative photography.',

  'Irix': 'Irix is a Swiss-Korean lens brand producing high-quality wide-angle and ultra-wide primes. Known for their weather-sealed metal construction and distinctive infrared markings, Irix lenses are available in Canon EF, Nikon F, and Pentax K mounts.',

  'Kamlan': 'Kamlan is a Chinese lens maker producing budget-friendly fast primes with large apertures. Their compact, fully manual lenses are popular among portrait and street photographers looking for affordable shallow depth-of-field options on mirrorless cameras.',

  'Kenko Teleplus': 'The Kenko Teleplus series consists of teleconverters (1.4x and 2x) that extend the reach of telephoto lenses. Compatible with major SLR and mirrorless mounts, they offer a cost-effective way to increase focal length while maintaining autofocus capability.',

  'Konica Hexanon': 'The Hexanon series was Konica\'s premium lens lineup, produced from the 1960s through the early 2000s. Renowned for their optical quality, particularly the 40mm and 57mm primes, Hexanon lenses remain sought-after by vintage lens enthusiasts.',

  'Laowa': 'Laowa, by Venus Optics, is a Chinese manufacturer known for innovative specialty lenses including ultra-wide angles, macro probes, and shift lenses. Their lineup features unique designs like the 24mm probe macro and zero-distortion wide-angles across most mirrorless mounts.',

  'Leica APO': 'Leica APO (Apochromatic) lenses feature advanced optical designs that correct chromatic aberration across three wavelengths of light. These represent some of Leica\'s highest-performing optics, delivering exceptional sharpness, contrast, and color accuracy.',

  'Leica Summaron': 'The Summaron is a classic Leica M-mount wide-angle lens family dating back to the 1950s. Originally available in 28mm and 35mm focal lengths, these compact lenses are prized for their vintage rendering and were reissued in limited editions.',

  'Lensbaby': 'Lensbaby produces creative effect lenses featuring selective focus, tilt, and artistic blur. Their modular system includes swappable optics for different effects, from the dreamy Sweet spot to the dramatic Edge blur, encouraging experimental photography.',

  'Meike': 'Meike is a Chinese manufacturer producing affordable manual focus lenses and cinema primes. Their lineup includes fast portrait primes and macro lenses for mirrorless mounts, offering solid optical performance at budget-friendly prices.',

  'NiSi': 'NiSi, primarily known for their optical filters, also produces high-quality manual focus lenses. Their lineup focuses on ultra-wide and specialty optics, leveraging their expertise in optical coatings for excellent flare resistance and color rendition.',

  'Nikon 1 Nikkor': 'The 1 Nikkor series was designed for Nikon\'s compact CX-format mirrorless system, produced from 2011 to 2018. These small, lightweight lenses covered focal lengths from 6.7mm to 70-300mm (18-810mm equivalent), optimized for the 1-inch sensor.',

  'Olympus M.Zuiko': 'The M.Zuiko Digital series is Olympus\'s (now OM System) standard lens lineup for Micro Four Thirds cameras. These compact lenses cover a wide range of focal lengths and are known for excellent portability without sacrificing image quality.',

  'Olympus M.Zuiko Pro': 'The M.Zuiko Digital Pro series represents Olympus\'s (now OM System) professional-grade Micro Four Thirds lenses. Featuring weather-sealed construction, fast constant apertures, and premium optics, they deliver DSLR-level performance in a compact format.',

  'Olympus Pen Zuiko': 'The Pen Zuiko series was designed for Olympus\'s original Pen F half-frame SLR system in the 1960s. These compact lenses are notable for their small size and excellent optical quality, now popular with mirrorless camera users via adapters.',

  'Panasonic Leica DG': 'The Leica DG series is a collaboration between Panasonic and Leica, producing premium Micro Four Thirds lenses. Designed to Leica\'s optical standards and certified by Leica Camera AG, these lenses offer exceptional image quality with weather sealing.',

  'Panasonic Lumix G': 'The Lumix G series is Panasonic\'s standard Micro Four Thirds lens lineup. These lenses balance affordability, compactness, and optical quality, covering everything from wide-angle to telephoto focal lengths for everyday photography and video.',

  'Pentax Q': 'The Pentax Q series was designed for Pentax\'s ultra-compact Q-mount mirrorless system, featuring the smallest interchangeable-lens format. The numbered lenses (01 through 08) range from standard primes to toy lenses with creative effects.',

  'Samsung NX': 'The Samsung NX series was Samsung\'s lens lineup for their APS-C mirrorless camera system, produced from 2010 to 2015. Despite Samsung\'s exit from the camera market, several NX lenses, particularly the 30mm f/2 pancake, earned strong reputations.',

  'Samsung NX-M': 'The Samsung NX-M series was designed for Samsung\'s compact NX Mini mirrorless cameras with a 1-inch sensor. This short-lived system produced a handful of small lenses before Samsung discontinued their camera division in 2015.',

  'Samyang XP': 'The Samyang XP (eXtra Performance) line represents Samyang\'s premium manual focus lenses, designed to resolve beyond 50 megapixels. These high-resolution optics target demanding landscape and studio photographers using high-megapixel full-frame bodies.',

  'Schneider': 'Schneider-Kreuznach is a German optical manufacturer with over a century of history, known for precision tilt-shift and large format lenses. Their PC-TS lenses offer perspective control for architectural photography with exceptional edge-to-edge sharpness.',

  'Sirui': 'Sirui, known primarily for their tripods, also produces anamorphic and standard lenses for mirrorless cameras. Their affordable 1.33x anamorphic primes brought cinematic widescreen shooting to a broader audience of independent filmmakers.',

  'Viltrox': 'Viltrox is a Chinese manufacturer producing autofocus lenses for mirrorless mounts at competitive prices. Known for fast primes like the 85mm f/1.8 and 56mm f/1.4, they offer strong value across Sony E, Fujifilm X, Nikon Z, and L-mount systems.',

  'Voigtlander APO-Lanthar': 'The APO-Lanthar series is Voigtlander\'s premium apochromatic lens line, featuring advanced optical designs for maximum sharpness and minimal chromatic aberration. These lenses are widely regarded as some of the sharpest primes available for mirrorless systems.',

  'Voigtlander Color-Skopar': 'The Color-Skopar series is Voigtlander\'s compact, affordable lens line. Originally a classic Voigtlander optical design, modern versions are available for Leica M, Sony E, and other mounts, offering excellent image quality in remarkably small packages.',

  'Voigtlander Heliar': 'The Heliar is one of Voigtlander\'s oldest optical designs, dating back to 1900. Modern Heliar lenses maintain the classic five-element formula\'s smooth rendering while incorporating contemporary coatings, available primarily for Leica M and Sony E mounts.',

  'Voigtlander Nokton': 'The Nokton series is Voigtlander\'s lineup of fast manual focus primes, typically featuring f/1.2 to f/1.5 maximum apertures. Known for their compact size, smooth focus feel, and distinctive wide-open rendering, they\'re popular for street and portrait photography.',

  'Voigtlander Ultron': 'The Ultron series features Voigtlander\'s moderately fast manual focus primes, typically around f/1.7 to f/2. These lenses balance speed, compactness, and optical performance, offering a more affordable alternative to the faster Nokton line.',
};

// Also update systems missing descriptions
const systemDescriptions = {
  'Canon RF-S': 'Canon RF-S is Canon\'s APS-C mirrorless lens mount, introduced in 2022 alongside the EOS R7 and R10. RF-S lenses are designed for Canon\'s crop-sensor mirrorless cameras but also mount on full-frame RF bodies in crop mode. The system shares the same physical mount as Canon RF.',

  'Four Thirds': 'The Four Thirds system was an open standard developed by Olympus and Kodak in 2003 for digital SLR cameras. It used a 4/3-inch sensor (17.3 × 13mm) with a 2x crop factor. The system was succeeded by Micro Four Thirds but its lenses remain compatible via adapters.',

  'Micro Four Thirds': 'Micro Four Thirds (MFT) is an open standard mirrorless camera system developed by Olympus and Panasonic in 2008. Using a 4/3-inch sensor with a 2x crop factor and a shorter flange distance than Four Thirds, MFT enables significantly smaller bodies and lenses while maintaining interchangeability across brands.',

  'Nikon 1': 'The Nikon 1 system was Nikon\'s compact mirrorless camera platform using a 1-inch CX-format sensor with a 2.7x crop factor. Produced from 2011 to 2018, it featured fast autofocus and high-speed shooting in a small form factor. The system was discontinued as Nikon shifted focus to the full-frame Z mount.',

  'Pentax Q': 'The Pentax Q system was the world\'s smallest interchangeable-lens camera system, launched in 2011. Using tiny 1/2.3-inch and 1/1.7-inch sensors, Q-mount cameras were remarkably compact. The system was discontinued but remains a curiosity for collectors and enthusiasts.',

  'Samsung NX-M': 'The Samsung NX-M mount was designed for Samsung\'s NX Mini compact mirrorless cameras, featuring a 1-inch BSI CMOS sensor. Launched in 2014, the system produced only a handful of lenses before Samsung exited the camera market in 2015.',
};

const missingSystems = await sql`SELECT id, name FROM systems WHERE description IS NULL OR description = '' ORDER BY name`;
console.log(`Systems without descriptions: ${missingSystems.length}`);

let sysUpdated = 0;
for (const sys of missingSystems) {
  const desc = systemDescriptions[sys.name];
  if (!desc) {
    console.log(`  No description for system: ${sys.name}`);
    continue;
  }
  if (!dryRun) {
    await sql`UPDATE systems SET description = ${desc} WHERE id = ${sys.id}`;
  }
  sysUpdated++;
  console.log(`  ${sys.name}: updated`);
}
console.log(`Systems updated: ${sysUpdated}/${missingSystems.length}\n`);

const missing = await sql`SELECT id, name FROM lens_series WHERE description IS NULL OR description = '' ORDER BY name`;
console.log(`Series without descriptions: ${missing.length}`);

let updated = 0;
for (const series of missing) {
  const desc = descriptions[series.name];
  if (!desc) {
    console.log(`  No description for: ${series.name}`);
    continue;
  }
  if (!dryRun) {
    await sql`UPDATE lens_series SET description = ${desc} WHERE id = ${series.id}`;
  }
  updated++;
  console.log(`  ${series.name}: updated`);
}

console.log(`\nDone! Updated: ${updated}/${missing.length} (dryRun=${dryRun})`);
