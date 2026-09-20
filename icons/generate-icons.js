/**
 * Run this script ONCE to generate PNG icon files for the Chrome extension.
 * Usage: node generate-icons.js
 * Requires: npm install canvas
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.22; // border radius

  // Rounded rect background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#2563eb');
  grad.addColorStop(1, '#7c3aed');

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Lightning bolt
  const s = size;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(s * 0.58, s * 0.14);
  ctx.lineTo(s * 0.26, s * 0.56);
  ctx.lineTo(s * 0.50, s * 0.56);
  ctx.lineTo(s * 0.42, s * 0.86);
  ctx.lineTo(s * 0.74, s * 0.44);
  ctx.lineTo(s * 0.50, s * 0.44);
  ctx.closePath();
  ctx.fill();

  return canvas.toBuffer('image/png');
}

const iconsDir = path.join(__dirname);
SIZES.forEach(size => {
  const buf = drawIcon(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ Generated ${outPath}`);
});
console.log('\nAll icons generated! You can now load the extension in Chrome.');
