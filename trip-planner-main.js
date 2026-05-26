/**
 * WanderNear Trip Planner - Vite entry point
 *
 * Firebase auth module so the trip planner page can check auth state.
 * Also exposes backend API URL to the global scope so the non-module
 * IIFE scripts (public/trip-planner.js) can read it without import.meta.env.
 */

// Firebase auth (ESM - import.meta.env injected by Vite)
import './firebase-config.js';
import './auth.js';

// Expose backend API base URL to window so public/trip-planner.js (IIFE) can use it.
// Vite replaces import.meta.env.VITE_API_BASE_URL at build time.
window.__WANDERNEAR_API_BASE__ = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
