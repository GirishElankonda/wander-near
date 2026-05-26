/**
 * Geolocation Module
 * Handles getting user's current location and converting it to a readable city name
 * 
 * Steps:
 * 1. Request user's location using browser Geolocation API
 * 2. Handle permission denied and error cases gracefully
 * 3. Convert latitude/longitude to city name using OpenStreetMap Nominatim API
 * 4. Display the city name in the input field
 * 
 * NOTE: Uses Nominatim (OpenStreetMap) instead of Google Geocoding API
 * Rate limit: 1 request per second (strictly enforced)
 */

(function() {
    'use strict';

    // Nominatim reverse geocoding URL (public, no API key required)
    // IMPORTANT: Nominatim has a strict rate limit of 1 request per second
    const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
    
    // Cache for geocoding results to avoid redundant API calls and respect rate limits
    const geocodeCache = new Map();
    
    // Maximum age for cached location (5 minutes)
    const CACHE_MAX_AGE = 5 * 60 * 1000;
    
    // Rate limiting: Track last request time to respect 1 req/sec limit
    let lastRequestTime = 0;
    const MIN_REQUEST_INTERVAL = 1000; // 1 second minimum between requests

    /**
     * Step 1: Get user's current location using Geolocation API
     * Returns a Promise that resolves with {lat, lng} or rejects with an error
     */
    function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            // Check if geolocation is supported
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            // Options for geolocation request
            const options = {
                enableHighAccuracy: true,  // Request high accuracy
                timeout: 10000,            // 10 second timeout
                maximumAge: 60000          // Accept cached location up to 1 minute old
            };

            // Request location
            navigator.geolocation.getCurrentPosition(
                // Success callback
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                // Error callback
                (error) => {
                    let errorMessage;
                    
                    // Step 2: Handle different error cases
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'Location information is unavailable.';
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'Location request timed out. Please try again.';
                            break;
                        default:
                            errorMessage = 'An unknown error occurred while getting your location.';
                            break;
                    }
                    
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    }

    /**
     * Step 3: Convert latitude/longitude to city name using OpenStreetMap Nominatim API
     * Returns a Promise that resolves with the city name or rejects with an error
     * 
     * NOTE: Nominatim has a strict rate limit of 1 request per second
     * We implement rate limiting and aggressive caching to respect this limit
     */
    function geocodeToCity(lat, lng) {
        // Check cache first
        const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        const cached = geocodeCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < CACHE_MAX_AGE) {
            return Promise.resolve(cached.cityName);
        }

        // Rate limiting: Ensure at least 1 second has passed since last request
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        
        return new Promise((resolve, reject) => {
            // If we need to wait, delay the request
            const delay = Math.max(0, MIN_REQUEST_INTERVAL - timeSinceLastRequest);
            
            setTimeout(() => {
                // Build Nominatim reverse geocoding URL
                // format=json returns JSON, addressdetails=1 includes detailed address components
                const url = `${NOMINATIM_REVERSE_URL}?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=10`;
                
                // Update last request time
                lastRequestTime = Date.now();

                fetch(url, {
                    headers: {
                        'User-Agent': 'WanderNear/1.0' // Nominatim requires a User-Agent
                    }
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        // Nominatim returns different structure than Google Geocoding
                        // Extract city name from address object
                        let cityName = null;
                        
                        if (data && data.address) {
                            const addr = data.address;
                            
                            // Priority order for city name extraction (Nominatim address structure):
                            // 1. city (most common)
                            // 2. town
                            // 3. village
                            // 4. municipality
                            // 5. county (administrative area)
                            // 6. state (fallback)
                            // 7. country (last resort)
                            
                            cityName = addr.city || 
                                      addr.town || 
                                      addr.village || 
                                      addr.municipality || 
                                      addr.county || 
                                      addr.state || 
                                      addr.country;
                        }
                        
                        // Fallback: use display_name (formatted address) if no city found
                        if (!cityName && data.display_name) {
                            // Extract first part of display_name (usually the city)
                            cityName = data.display_name.split(',')[0].trim();
                        }

                        if (!cityName) {
                            throw new Error('Could not determine city name from location.');
                        }

                        // Cache the result
                        geocodeCache.set(cacheKey, {
                            cityName: cityName,
                            timestamp: Date.now()
                        });

                        resolve(cityName);
                    })
                    .catch(error => {
                        // Handle network errors
                        if (error.message.includes('fetch') || error.message.includes('Network')) {
                            reject(new Error('Network error. Please check your internet connection.'));
                        } else {
                            reject(error);
                        }
                    });
            }, delay);
        });
    }

    /**
     * Step 4: Main function to get location and update input field
     * Handles the complete flow: get location -> geocode -> update UI
     */
    function updateLocationInput(inputElement, buttonElement) {
        // Validate elements
        if (!inputElement) {
            console.error('Location input element not found');
            return;
        }

        // Disable button and show loading state
        if (buttonElement) {
            buttonElement.disabled = true;
            const originalHTML = buttonElement.innerHTML;
            buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            // Re-enable button after operation (success or error)
            const reenableButton = () => {
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalHTML;
            };

            // Get location and geocode
            getCurrentLocation()
                .then(coords => {
                    // Update input with loading message
                    inputElement.value = 'Getting location...';
                    inputElement.disabled = true;
                    
                    return geocodeToCity(coords.lat, coords.lng);
                })
                .then(cityName => {
                    // Step 4: Display city name in input field
                    inputElement.value = cityName;
                    inputElement.disabled = false;
                    
                    // Trigger input event for any listeners
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    reenableButton();
                    
                    // Optional: Show success message
                    if (typeof showToast === 'function') {
                        showToast(`Location updated: ${cityName}`, 'success');
                    }
                })
                .catch(error => {
                    // Handle errors gracefully
                    inputElement.disabled = false;
                    reenableButton();
                    
                    // Show error message
                    const errorMsg = error.message || 'Failed to get location';
                    if (typeof showToast === 'function') {
                        showToast(errorMsg, 'error');
                    } else {
                        alert(errorMsg);
                    }
                    
                    console.error('Geolocation error:', error);
                });
        } else {
            // If no button, just run the flow without UI updates
            getCurrentLocation()
                .then(coords => geocodeToCity(coords.lat, coords.lng))
                .then(cityName => {
                    inputElement.value = cityName;
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                })
                .catch(error => {
                    const errorMsg = error.message || 'Failed to get location';
                    if (typeof showToast === 'function') {
                        showToast(errorMsg, 'error');
                    } else {
                        alert(errorMsg);
                    }
                    console.error('Geolocation error:', error);
                });
        }
    }

    /**
     * Initialize the geolocation functionality
     * Sets up event listeners when DOM is ready
     */
    function initGeolocation() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGeolocation);
            return;
        }

        // Find the location input and button elements
        const locationInput = document.getElementById('locationInput');
        const useLocationBtn = document.getElementById('useLocationBtn');

        if (!locationInput) {
            console.warn('Location input element (#locationInput) not found');
            return;
        }

        if (useLocationBtn) {
            // Add click event listener to button
            useLocationBtn.addEventListener('click', function(e) {
                e.preventDefault();
                updateLocationInput(locationInput, useLocationBtn);
            });
        } else {
            console.warn('Use location button (#useLocationBtn) not found');
        }
    }

    // Initialize when script loads
    initGeolocation();

    // Export functions for external use if needed
    if (typeof window !== 'undefined') {
        window.GeolocationModule = {
            getCurrentLocation: getCurrentLocation,
            geocodeToCity: geocodeToCity,
            updateLocationInput: updateLocationInput
        };
    }
})();

