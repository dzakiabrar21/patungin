import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const iconsDir = path.resolve('public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Modern fintech SVG icon for PatungIn
function getSvg(size, isMaskable = false) {
  const padding = isMaskable ? size * 0.15 : 0;
  const innerSize = size - padding * 2;
  const radius = isMaskable ? 0 : Math.round(size * 0.22); // iOS squircle radius

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#05282F"/>
        <stop offset="45%" stop-color="#007F88"/>
        <stop offset="100%" stop-color="#24B9B4"/>
      </linearGradient>
      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="#E2F8F5"/>
      </linearGradient>
      <linearGradient id="glowGrad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stop-color="#6FF2DD" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#6FF2DD" stop-opacity="0"/>
      </linearGradient>
      <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="${Math.round(size * 0.04)}" stdDeviation="${Math.round(size * 0.05)}" flood-color="#021C22" flood-opacity="0.35"/>
      </filter>
    </defs>

    <!-- Background -->
    <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bgGrad)"/>
    <circle cx="${size * 0.8}" cy="${size * 0.2}" r="${size * 0.4}" fill="url(#glowGrad)"/>

    <!-- Centered Logo Graphics -->
    <g transform="translate(${padding}, ${padding})">
      <g filter="url(#dropShadow)" transform="translate(${innerSize * 0.18}, ${innerSize * 0.22})">
        <!-- Main Card Shape -->
        <rect x="0" y="0" width="${innerSize * 0.64}" height="${innerSize * 0.44}" rx="${innerSize * 0.09}" fill="url(#cardGrad)"/>
        
        <!-- Card Magnetic Strip / Horizon Line -->
        <rect x="0" y="${innerSize * 0.10}" width="${innerSize * 0.64}" height="${innerSize * 0.08}" fill="#007F88" fill-opacity="0.9"/>
        
        <!-- Smart Chip / Growth Sparkle -->
        <circle cx="${innerSize * 0.15}" cy="${innerSize * 0.28}" r="${innerSize * 0.045}" fill="#0C5F68"/>
        
        <!-- Mini Wave Bars (Finance Growth) -->
        <rect x="${innerSize * 0.32}" y="${innerSize * 0.30}" width="${innerSize * 0.045}" height="${innerSize * 0.06}" rx="${innerSize * 0.02}" fill="#007F88"/>
        <rect x="${innerSize * 0.40}" y="${innerSize * 0.25}" width="${innerSize * 0.045}" height="${innerSize * 0.11}" rx="${innerSize * 0.02}" fill="#007F88"/>
        <rect x="${innerSize * 0.48}" y="${innerSize * 0.20}" width="${innerSize * 0.045}" height="${innerSize * 0.16}" rx="${innerSize * 0.02}" fill="#00A6A6"/>
      </g>

      <!-- Dynamic Coin / Savings Dot -->
      <circle cx="${innerSize * 0.72}" cy="${innerSize * 0.30}" r="${innerSize * 0.09}" fill="#6FF2DD" stroke="#007F88" stroke-width="${innerSize * 0.025}" filter="url(#dropShadow)"/>
      <path d="M ${innerSize * 0.72} ${innerSize * 0.25} L ${innerSize * 0.72} ${innerSize * 0.35} M ${innerSize * 0.67} ${innerSize * 0.30} L ${innerSize * 0.77} ${innerSize * 0.30}" stroke="#007F88" stroke-width="${innerSize * 0.02}" stroke-linecap="round"/>
    </g>
  </svg>
  `;
}

async function generate() {
  const sizes = [
    { name: 'icon-16.png', size: 16 },
    { name: 'icon-32.png', size: 32 },
    { name: 'icon-152.png', size: 152 },
    { name: 'icon-167.png', size: 167 },
    { name: 'icon-180.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-maskable.png', size: 512, maskable: true },
  ];

  for (const item of sizes) {
    const svgStr = getSvg(item.size, item.maskable || false);
    const dest = path.join(iconsDir, item.name);
    await sharp(Buffer.from(svgStr))
      .png()
      .toFile(dest);
    console.log(`Generated: ${item.name} (${item.size}x${item.size})`);
  }

  // Also write favicon.svg
  fs.writeFileSync(path.join(iconsDir, 'favicon.svg'), getSvg(128, false));
  console.log('All icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
