const fs = require('fs');
const path = require('path');

// Simple SVG icon (price tag with dollar sign)
const generateSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#111827"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.35}" fill="#22c55e"/>
  <text x="${size/2}" y="${size/2 + size*0.12}" font-family="Arial, sans-serif" font-size="${size*0.3}" font-weight="bold" fill="white" text-anchor="middle">$</text>
</svg>`;

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG icons
sizes.forEach(size => {
  const svg = generateSvg(size);
  const filename = `icon-${size}x${size}.svg`;
  fs.writeFileSync(path.join(iconsDir, filename), svg);
  console.log(`Generated ${filename}`);
});

console.log('Done! Note: For production, convert SVGs to PNGs');
