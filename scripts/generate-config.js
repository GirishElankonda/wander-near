/**
 * Build-time script: reads .env and generates config.generated.js for the browser.
 * Run: node scripts/generate-config.js
 * Use in CI: set env vars, then run this script; serve the generated file with the app.
 */
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency required for minimal setup)
const envPath = path.join(__dirname, '..', '.env');
let env = {};
if (fs.existsSync(envPath)) {
  const rawEnv = fs.readFileSync(envPath, 'utf8');
  rawEnv.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) return;

    const key = line.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;

    let val = line.slice(equalsIndex + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }

    env[key] = val;
  });
} else {
  console.warn('.env not found; using process.env only. Copy .env.example to .env for local dev.');
}

// Prefer process.env (for CI/production), fallback to .env file
function get(key) {
  const processValue = process.env[key];
  if (typeof processValue === 'string' && processValue.trim() !== '') {
    return processValue;
  }
  const envValue = env[key];
  if (typeof envValue === 'string' && envValue.trim() !== '') {
    return envValue;
  }
  return '';
}

const firebase = {
  apiKey: get('VITE_FIREBASE_API_KEY'),
  authDomain: get('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: get('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: get('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: get('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: get('VITE_FIREBASE_APP_ID'),
  measurementId: get('VITE_FIREBASE_MEASUREMENT_ID')
};

const config = {
  firebase,
  overpassApiUrl: get('VITE_OVERPASS_API_URL') || 'https://overpass-api.de/api/interpreter',
  nominatimReverseUrl: get('VITE_NOMINATIM_REVERSE_URL') || 'https://nominatim.openstreetmap.org/reverse',
  nominatimSearchUrl: get('VITE_NOMINATIM_SEARCH_URL') || 'https://nominatim.openstreetmap.org/search',
  osmTileUrl: get('VITE_OSM_TILE_URL') || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  demoVideoEmbedUrl: get('VITE_DEMO_VIDEO_EMBED_URL') || 'https://www.youtube.com/embed/dQw4w9WgXcQ'
};

const outDir = path.join(__dirname, '..');
const outPath = path.join(outDir, 'config.generated.js');
const content = `/**
 * Auto-generated from .env – do not edit. Regenerate with: node scripts/generate-config.js
 */
(function() {
  'use strict';
  window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};
})();
`;
fs.writeFileSync(outPath, content, 'utf8');
console.log('Wrote', outPath);
