// Script Node.js pour générer les icônes PNG de l'extension
// Usage : node generate-icons.js
// Nécessite : npm install canvas

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fond arrondi bleu foncé
  const radius = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = '#181c27';
  ctx.fill();

  // Œil stylisé
  const cx = size / 2;
  const cy = size / 2;
  const eyeW = size * 0.6;
  const eyeH = size * 0.32;

  ctx.beginPath();
  ctx.ellipse(cx, cy, eyeW / 2, eyeH / 2, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#4f8ef7';
  ctx.lineWidth = size * 0.08;
  ctx.stroke();

  // Pupille
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = '#4f8ef7';
  ctx.fill();

  // Point brillant
  ctx.beginPath();
  ctx.arc(cx + size * 0.05, cy - size * 0.04, size * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return canvas.toBuffer('image/png');
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

[16, 48, 128].forEach(size => {
  const buf = drawIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`icon${size}.png généré`);
});

console.log('Icônes générées dans icons/');
