/**
 * WanderNear - Main entry point for Vite bundling
 *
 * Imports all modules so Vite can bundle them together,
 * inject import.meta.env, and output a clean dist/ folder.
 *
 * Load order matters:
 *  1. Firebase auth/bookings (module) - sets up auth state
 *  2. Background animation (module)
 *  3. Geolocation IIFE - exposes window.GeolocationModule
 *  4. App IIFE - uses L (Leaflet from CDN) and GeolocationModule
 */

// Firebase modules (ESM - import.meta.env injected here)
import './firebase-config.js';
import './auth.js';
import './bookings.js';

// Galaxy background WebGL animation
import './background-animation.js';
