// scripts/bundle-ui.js
// Copies src/ui.html → dist/ui.html (no bundling needed for plain HTML)
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

fs.copyFileSync(
  path.join(__dirname, '..', 'src', 'ui.html'),
  path.join(distDir, 'ui.html')
);

console.log('✓ ui.html copied to dist/');
