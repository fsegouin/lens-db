/**
 * DPReview Camera Scraper
 *
 * This script is meant to be used with the Chrome browser automation.
 * It outputs a JSON file with camera data extracted from dpreview product pages.
 *
 * Usage: Run via browser automation - navigate to each URL, extract specs, collect images.
 * The extraction logic runs in the browser context via javascript_tool.
 */

// This is the extraction function to run in the browser on each camera page.
// Copy-paste into javascript_tool for each page.
export const EXTRACT_CAMERA_JS = `
(function() {
  const result = {};

  // Get camera name from h1 (remove " Overview" suffix)
  const h1 = document.querySelector('h1');
  result.name = h1 ? h1.innerText.replace(/\\s*Overview$/, '').trim() : '';

  // Get announce date
  const body = document.body.innerText;
  const announceMatch = body.match(/Announced\\s+([\\w]+\\s+\\d+,\\s+\\d{4})/);
  result.announced = announceMatch ? announceMatch[1] : null;

  // Extract quick specs
  const specsMatch = body.match(/Quick specs([\\s\\S]*?)(?:Our review|See full specifications)/);
  const specs = {};
  if (specsMatch) {
    specsMatch[1].trim().split('\\n').forEach(line => {
      const parts = line.split('\\t');
      if (parts.length === 2) {
        specs[parts[0].trim()] = parts[1].trim();
      }
    });
  }
  result.specs = specs;

  // Parse key fields from specs
  result.bodyType = specs['Body type'] || null;
  result.sensorType = specs['Sensor type'] || null;
  result.sensorSize = specs['Sensor size'] || null;
  result.lensMount = specs['Lens mount'] || null;

  const mpMatch = specs['Effective pixels']?.match(/(\\d+)/);
  result.megapixels = mpMatch ? parseInt(mpMatch[1]) : null;

  result.resolution = specs['Max resolution'] || null;
  if (result.resolution && result.megapixels) {
    result.resolution = result.resolution + ' - ' + result.megapixels + ' MP';
  }

  const weightMatch = specs['Weight (inc. batteries)']?.match(/(\\d+)\\s*g/);
  result.weightG = weightMatch ? parseInt(weightMatch[1]) : null;

  // Year from announce date
  if (result.announced) {
    const yearMatch = result.announced.match(/(\\d{4})/);
    result.yearIntroduced = yearMatch ? parseInt(yearMatch[1]) : null;
  }

  // Sensor size normalization
  if (result.sensorSize) {
    if (result.sensorSize.toLowerCase().includes('full frame')) {
      result.sensorSizeNorm = '35mm full frame';
    } else if (result.sensorSize.toLowerCase().includes('aps-c') || result.sensorSize.toLowerCase().includes('23.5') || result.sensorSize.toLowerCase().includes('22.')) {
      result.sensorSizeNorm = 'APS-C';
    } else if (result.sensorSize.toLowerCase().includes('four thirds') || result.sensorSize.toLowerCase().includes('17.3')) {
      result.sensorSizeNorm = 'Four Thirds';
    } else if (result.sensorSize.toLowerCase().includes('medium format') || result.sensorSize.toLowerCase().includes('43.8') || result.sensorSize.toLowerCase().includes('44 x')) {
      result.sensorSizeNorm = 'Medium Format';
    } else {
      result.sensorSizeNorm = result.sensorSize;
    }
  }

  // Get product images from background-image styles
  const productBgs = [...document.querySelectorAll('[style*="products/"]')]
    .map(el => {
      const match = el.getAttribute('style').match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
      return match ? match[1] : null;
    }).filter(Boolean);

  // Also from og:image
  const ogImg = document.querySelector('meta[property="og:image"]')?.content;
  if (ogImg) productBgs.push(ogImg);

  // Extract unique shot hashes and build full-size URLs
  const shots = new Set();
  const dpreviewSlug = window.location.pathname.split('/').pop();
  productBgs.forEach(url => {
    const match = url.match(/products\\/[^/]+\\/shots\\/([a-f0-9]+\\.png)/);
    if (match) shots.add(match[1]);
  });

  result.images = [...shots].map(h =>
    'https://1.img-dpreview.com/files/p/E~products/' + dpreviewSlug + '/shots/' + h
  );

  result.dpreviewSlug = dpreviewSlug;
  result.dpreviewUrl = window.location.href;

  return JSON.stringify(result);
})()
`;

// Helper: given extracted data, generate our DB slug
export function generateSlug(name, year) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return year ? `camera/${base}-${year}` : `camera/${base}`;
}

// Helper: normalize name for matching
export function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
