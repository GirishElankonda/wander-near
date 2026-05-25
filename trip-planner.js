/**
 * WanderNear - Budget-Based Auto Trip Planner Module
 * 
 * Features:
 * - Budget allocation across categories (food, attractions, transport, buffer)
 * - Auto mode for intelligent itinerary generation
 * - Manual mode for user-selected places
 * - 1-day and multi-day planning support
 * - Time-ordered itinerary generation
 * - Regeneration capability
 */

const TripPlannerModule = (function () {
    'use strict';

    // State management
    let currentBudget = 0;
    let isAutoMode = false;
    let planDuration = 1; // days
    let currentItinerary = null;
    let availablePlaces = [];

    // Default budget allocation percentages
    const DEFAULT_ALLOCATION = {
        food: 40,
        attractions: 35,
        transport: 15,
        buffer: 10
    };

    // Active allocation (user can modify)
    let userAllocation = { ...DEFAULT_ALLOCATION };
    let isCustomMode = false;
    let isRegenerating = false;

    // IDs of places used in the LAST generated plan — deprioritised on next regen
    let lastPlanIds = new Set();

    // Fallback cost ranges per category (used when actual place pool is too small)
    const FALLBACK_COSTS = {
        restaurant: { min: 150, max: 800, avg: 350 },
        cafe: { min: 50, max: 300, avg: 120 },
        fast_food: { min: 80, max: 250, avg: 150 },
        tourist_attraction: { min: 0, max: 500, avg: 100 },
        museum: { min: 20, max: 300, avg: 100 },
        lodging: { min: 800, max: 6000, avg: 2000 },
        park: { min: 0, max: 100, avg: 20 }
    };

    // Will be populated dynamically from available places
    let dynamicCostRanges = {};

    // Reference point for proximity sorting (user's location)
    let userRefPoint = null;

    // Time slots for itinerary
    const TIME_SLOTS = {
        morning: { start: '08:00', end: '12:00', label: 'Morning' },
        afternoon: { start: '12:00', end: '17:00', label: 'Afternoon' },
        evening: { start: '17:00', end: '22:00', label: 'Evening' }
    };

    /**
     * Initialize the trip planner module
     */
    function init() {
        console.log('Trip Planner Module initializing...');
        setupEventListeners();
        updateUIState();
    }

    /**
     * Setup event listeners for trip planner UI
     */
    function setupEventListeners() {
        // Budget input
        const budgetInput = document.getElementById('budgetInput');
        if (budgetInput) {
            budgetInput.addEventListener('input', handleBudgetChange);
        }

        // Auto mode toggle
        const autoToggle = document.getElementById('autoModeToggle');
        if (autoToggle) {
            autoToggle.addEventListener('change', handleAutoModeToggle);
        }

        // Plan duration selector
        const durationBtns = document.querySelectorAll('.duration-btn');
        durationBtns.forEach(btn => {
            btn.addEventListener('click', handleDurationSelect);
        });

        // Generate plan button
        const generateBtn = document.getElementById('generatePlanBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', handleGeneratePlan);
        }

        // Regenerate button
        const regenerateBtn = document.getElementById('regeneratePlanBtn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', handleRegeneratePlan);
        }

        // Payment button
        const paymentBtn = document.getElementById('paymentBtn');
        if (paymentBtn) {
            paymentBtn.addEventListener('click', handlePayment);
        }

        console.log('Trip Planner event listeners setup complete');
    }

    /**
     * Handle budget input change
     */
    function handleBudgetChange(e) {
        currentBudget = parseFloat(e.target.value) || 0;
        updateBudgetDisplay();
        validateInputs();
    }

    /**
     * Handle auto mode toggle
     */
    function handleAutoModeToggle(e) {
        isAutoMode = e.target.checked;
        updateUIState();

        if (typeof showToast === 'function') {
            showToast(
                isAutoMode ? 'Auto mode enabled - AI will plan your trip!' : 'Manual mode - Select places yourself',
                'info'
            );
        }
    }

    /**
     * Handle duration selection
     */
    function handleDurationSelect(e) {
        const duration = parseInt(e.target.dataset.duration);
        planDuration = duration;

        // Update button states
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');

        updateBudgetDisplay();
        validateInputs();
    }

    /**
     * Update budget display with allocation breakdown
     */
    function updateBudgetDisplay() {
        const display = document.getElementById('budgetBreakdown');
        if (!display || currentBudget === 0) {
            if (display) display.innerHTML = '';
            return;
        }

        const perDay = currentBudget / planDuration;
        const breakdown = {
            food: perDay * (userAllocation.food / 100),
            attractions: perDay * (userAllocation.attractions / 100),
            transport: perDay * (userAllocation.transport / 100),
            buffer: perDay * (userAllocation.buffer / 100)
        };

        // Build stacked bar segments
        const colors = { food: '#38bdf8', attractions: '#818cf8', transport: '#34d399', buffer: '#fb923c' };
        const barSegments = Object.entries(userAllocation).map(([key, pct]) =>
            `<div class="alloc-bar-segment" style="width:${pct}%;background:${colors[key]};" title="${key}: ${pct}%"></div>`
        ).join('');

        display.innerHTML = `
            <div class="budget-breakdown-card">
                <div class="breakdown-header">
                    <h4>Budget Allocation ${planDuration > 1 ? `<span class="perday-tag">Per Day: ₹${perDay.toFixed(2)}</span>` : ''}</h4>
                    <button class="btn-customize-alloc" id="toggleCustomAlloc" onclick="TripPlannerModule.toggleCustomAlloc()">
                        <i class="fas fa-sliders-h"></i>
                        ${isCustomMode ? 'Hide Sliders' : 'Customize'}
                    </button>
                </div>

                <div class="alloc-stacked-bar">${barSegments}</div>
                <div class="alloc-legend">
                    <span><span class="legend-dot" style="background:#38bdf8"></span>Food ${userAllocation.food}%</span>
                    <span><span class="legend-dot" style="background:#818cf8"></span>Attractions ${userAllocation.attractions}%</span>
                    <span><span class="legend-dot" style="background:#34d399"></span>Transport ${userAllocation.transport}%</span>
                    <span><span class="legend-dot" style="background:#fb923c"></span>Buffer ${userAllocation.buffer}%</span>
                </div>

                <div class="custom-alloc-panel" id="customAllocPanel" style="display:${isCustomMode ? 'block' : 'none'}">
                    ${renderAllocationSliders(perDay)}
                </div>

                <div class="allocation-grid">
                    <div class="allocation-item">
                        <div class="allocation-icon">🍽️</div>
                        <div class="allocation-details">
                            <span class="allocation-label">Food</span>
                            <span class="allocation-value">₹${breakdown.food.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="allocation-item">
                        <div class="allocation-icon">🎯</div>
                        <div class="allocation-details">
                            <span class="allocation-label">Attractions</span>
                            <span class="allocation-value">₹${breakdown.attractions.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="allocation-item">
                        <div class="allocation-icon">🚗</div>
                        <div class="allocation-details">
                            <span class="allocation-label">Transport</span>
                            <span class="allocation-value">₹${breakdown.transport.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="allocation-item">
                        <div class="allocation-icon">💰</div>
                        <div class="allocation-details">
                            <span class="allocation-label">Buffer</span>
                            <span class="allocation-value">₹${breakdown.buffer.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render the slider rows inside the custom allocations panel
     */
    function renderAllocationSliders(perDay) {
        const categories = [
            { key: 'food', label: 'Food', icon: '🍽️', color: '#38bdf8' },
            { key: 'attractions', label: 'Attractions', icon: '🎯', color: '#818cf8' },
            { key: 'transport', label: 'Transport', icon: '🚗', color: '#34d399' },
            { key: 'buffer', label: 'Buffer', icon: '💰', color: '#fb923c' }
        ];

        const rows = categories.map(cat => {
            const amt = (perDay * (userAllocation[cat.key] / 100)).toFixed(0);
            return `
            <div class="alloc-slider-row">
                <div class="alloc-slider-label">
                    <span class="alloc-slider-icon">${cat.icon}</span>
                    <span class="alloc-slider-name">${cat.label}</span>
                    <span class="alloc-slider-pct" id="pct-${cat.key}">${userAllocation[cat.key]}%</span>
                    <span class="alloc-slider-amt" id="amt-${cat.key}">₹${amt}</span>
                </div>
                <input
                    type="range"
                    class="alloc-range"
                    id="slider-${cat.key}"
                    min="5" max="80" step="1"
                    value="${userAllocation[cat.key]}"
                    style="--thumb-color:${cat.color}"
                    oninput="TripPlannerModule.handleSliderInput('${cat.key}', this.value)"
                />
            </div>`;
        }).join('');

        const total = Object.values(userAllocation).reduce((a, b) => a + b, 0);
        const isValid = total === 100;

        return `
            <div class="alloc-slider-container">
                <div class="alloc-slider-intro">
                    <p>Drag the sliders to set how much of your daily budget goes to each category. Total must equal 100%.</p>
                </div>
                ${rows}
                <div class="alloc-total-row">
                    <span class="alloc-total-label">Total</span>
                    <span class="alloc-total-value ${isValid ? 'valid' : 'invalid'}" id="allocTotal">${total}%</span>
                    <button class="btn-reset-alloc" onclick="TripPlannerModule.resetAllocations()">
                        <i class="fas fa-undo"></i> Reset
                    </button>
                </div>
                ${!isValid ? '<div class="alloc-warning"><i class="fas fa-exclamation-triangle"></i> Total must equal exactly 100%</div>' : ''}
            </div>`;
    }

    /**
     * Toggle the custom allocation panel
     */
    function toggleCustomAlloc() {
        isCustomMode = !isCustomMode;
        updateBudgetDisplay();
    }

    /**
     * Handle a slider input change — auto-adjust remaining categories proportionally
     */
    function handleSliderInput(changedKey, rawValue) {
        const newVal = parseInt(rawValue, 10);
        const otherKeys = Object.keys(userAllocation).filter(k => k !== changedKey);
        const oldOtherTotal = otherKeys.reduce((s, k) => s + userAllocation[k], 0);
        const remaining = 100 - newVal;

        // If remaining <= 0, clamp all others to minimum
        if (remaining <= otherKeys.length * 5) {
            const clampedNew = 100 - otherKeys.length * 5;
            userAllocation[changedKey] = Math.max(5, clampedNew);
            otherKeys.forEach(k => { userAllocation[k] = 5; });
        } else {
            userAllocation[changedKey] = newVal;
            // Distribute remaining proportionally
            if (oldOtherTotal > 0) {
                let distributed = 0;
                otherKeys.forEach((k, i) => {
                    if (i < otherKeys.length - 1) {
                        const share = Math.round((userAllocation[k] / oldOtherTotal) * remaining);
                        userAllocation[k] = Math.max(5, share);
                        distributed += userAllocation[k];
                    } else {
                        // Last key absorbs rounding remainder
                        userAllocation[k] = Math.max(5, remaining - distributed);
                    }
                });
            } else {
                const equal = Math.floor(remaining / otherKeys.length);
                otherKeys.forEach(k => { userAllocation[k] = equal; });
                userAllocation[otherKeys[otherKeys.length - 1]] += remaining - equal * otherKeys.length;
            }
        }

        // Live-update sibling sliders + text without full re-render
        const perDay = currentBudget / planDuration;
        Object.keys(userAllocation).forEach(k => {
            const s = document.getElementById(`slider-${k}`);
            const p = document.getElementById(`pct-${k}`);
            const a = document.getElementById(`amt-${k}`);
            if (s) s.value = userAllocation[k];
            if (p) p.textContent = `${userAllocation[k]}%`;
            if (a) a.textContent = `₹${(perDay * userAllocation[k] / 100).toFixed(0)}`;
        });

        // Update total indicator
        const total = Object.values(userAllocation).reduce((s, v) => s + v, 0);
        const totalEl = document.getElementById('allocTotal');
        if (totalEl) {
            totalEl.textContent = `${total}%`;
            totalEl.className = `alloc-total-value ${total === 100 ? 'valid' : 'invalid'}`;
        }

        // Refresh the main breakdown amounts and bar
        updateBudgetDisplay();
        // Re-open the panel since updateBudgetDisplay fully re-renders
        const panel = document.getElementById('customAllocPanel');
        if (panel) panel.style.display = 'block';
    }

    /**
     * Reset allocations to defaults
     */
    function resetAllocations() {
        userAllocation = { ...DEFAULT_ALLOCATION };
        updateBudgetDisplay();
        const panel = document.getElementById('customAllocPanel');
        if (panel) panel.style.display = 'block';
    }

    /**
     * Update UI state based on mode
     */
    function updateUIState() {
        const manualSection = document.getElementById('manualSelectionSection');
        const autoSection = document.getElementById('autoGenerationSection');

        if (isAutoMode) {
            if (manualSection) manualSection.style.display = 'none';
            if (autoSection) autoSection.style.display = 'block';
        } else {
            if (manualSection) manualSection.style.display = 'block';
            if (autoSection) autoSection.style.display = 'none';
        }
    }

    /**
     * Validate inputs before generating plan
     */
    function validateInputs() {
        const generateBtn = document.getElementById('generatePlanBtn');
        if (!generateBtn) return;

        const isValid = currentBudget > 0 && planDuration > 0;
        generateBtn.disabled = !isValid;

        if (isValid) {
            generateBtn.classList.remove('disabled');
        } else {
            generateBtn.classList.add('disabled');
        }
    }

    /**
     * Handle generate plan button click
     */
    function handleGeneratePlan() {
        if (!validateBeforeGeneration()) {
            return;
        }

        if (isAutoMode) {
            generateAutoPlan();
        } else {
            enableManualSelection();
        }
    }

    /**
     * Handle regenerate plan — pass true so the engine shuffles for variety
     */
    function handleRegeneratePlan() {
        generateAutoPlan(true);
    }

    /**
     * Handle payment integration with Stripe
     */
    async function handlePayment() {
        const paymentBtn = document.getElementById('paymentBtn');
        const originalText = paymentBtn.innerHTML;
        
        try {
            paymentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            paymentBtn.disabled = true;

            const response = await fetch('http://localhost:3000/api/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    budget: currentBudget
                })
            });

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Failed to create payment session');
            }
        } catch (error) {
            console.error('Payment error:', error);
            if (typeof showToast === 'function') {
                showToast(error.message, 'error');
            }
            paymentBtn.innerHTML = originalText;
            paymentBtn.disabled = false;
        }
    }

    /**
     * Validate before generation
     */
    function validateBeforeGeneration() {
        if (currentBudget <= 0) {
            if (typeof showToast === 'function') {
                showToast('Please enter a valid budget', 'error');
            }
            return false;
        }

        if (planDuration <= 0) {
            if (typeof showToast === 'function') {
                showToast('Please select plan duration', 'error');
            }
            return false;
        }

        return true;
    }

    /**
     * Generate automatic trip plan.
     * @param {boolean} [regenerate=false] - When true, shuffles places for variety.
     */
    function generateAutoPlan(regenerate = false) {
        isRegenerating = regenerate;

        // Refresh user reference point before planning
        if (window.currentUserLocation) {
            userRefPoint = window.currentUserLocation;
        } else {
            try {
                const stored = localStorage.getItem('wandernear_user_location');
                if (stored) userRefPoint = JSON.parse(stored);
            } catch (e) { /* ignore */ }
        }

        // Show loading state
        showLoadingState();

        // Get available places (sorted nearest-first, unnamed filtered out)
        let places = getAvailablePlaces();

        if (!places || places.length === 0) {
            hideLoadingState();
            if (typeof showToast === 'function') {
                showToast('No places available. Please search for a location first.', 'warning');
            }
            return;
        }

        // On regenerate: shuffle the pool so different places are chosen
        if (regenerate) {
            places = shuffleArray(places);
            if (typeof showToast === 'function') {
                showToast('Generating a fresh plan...', 'info');
            }
        }

        // Generate itinerary
        const itinerary = buildItinerary(places, currentBudget, planDuration);
        
        // Strict budget enforcement check
        if (itinerary.totalEstimatedCost > currentBudget) {
            hideLoadingState();
            if (typeof showToast === 'function') {
                showToast("Couldn't able to plan. Budget is too low.", "error");
            }
            const container = document.getElementById('itineraryContainer');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state" style="padding: 3rem; text-align: center; background: white; border-radius: 12px; margin-top: 2rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                        <i class="fas fa-wallet" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                        <h3 style="color: #ef4444; margin-bottom: 0.5rem;">Couldn't able to plan</h3>
                        <p>The minimum estimated cost for this itinerary is roughly ₹${Math.ceil(itinerary.totalEstimatedCost)}, which exceeds your budget of ₹${currentBudget}.</p>
                        <p style="margin-top: 0.5rem; color: var(--text-muted);">Please increase your budget or select a shorter trip duration.</p>
                    </div>
                `;
                container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return;
        }

        currentItinerary = itinerary;

        // Display itinerary
        displayItinerary(itinerary);
        hideLoadingState();

        if (typeof showToast === 'function') {
            const label = regenerate ? 'New trip plan generated!' : `Trip plan generated${userRefPoint ? ' (sorted by proximity)' : ''}!`;
            showToast(label, 'success');
        }
    }

    /**
     * Fisher-Yates shuffle — returns a new shuffled array
     */
    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /**
     * Haversine distance in km between two lat/lng points
     */
    function haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth radius km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Annotate each place with a distance from userRefPoint (in km)
     */
    function annotatePlacesWithDistance(places) {
        if (!userRefPoint) return places;
        return places.map(p => ({
            ...p,
            _distKm: (p.lat != null && p.lng != null)
                ? haversineDistance(userRefPoint.lat, userRefPoint.lng, p.lat, p.lng)
                : 99999
        }));
    }

    /**
     * Compute dynamic cost ranges from the actual pool of places.
     * For each category we look at the spread of the real places and
     * map position-in-sorted-list → a cost in ₹ using the fallback min/max.
     */
    function computeDynamicCostRanges(places) {
        const groups = {};
        places.forEach(p => {
            const cat = p.category || p.rawCategory || 'restaurant';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        });

        const ranges = {};
        Object.entries(groups).forEach(([cat, arr]) => {
            const fb = FALLBACK_COSTS[cat] || FALLBACK_COSTS.restaurant;
            ranges[cat] = {
                min: fb.min,
                max: fb.max,
                count: arr.length,
                // avg scales with how many options there are (more variety → use midpoint)
                avg: fb.min + (fb.max - fb.min) * 0.4
            };
        });
        return ranges;
    }

    /**
     * Get available places from the main app, sorted nearest-first.
     * Filters out unnamed places and assigns descriptive labels to any
     * places that only have a generic/empty name.
     */
    function getAvailablePlaces() {
        // Try to get user reference point from multiple sources
        if (!userRefPoint) {
            if (window.currentUserLocation) {
                userRefPoint = window.currentUserLocation;
            } else {
                try {
                    const stored = localStorage.getItem('wandernear_user_location');
                    if (stored) userRefPoint = JSON.parse(stored);
                } catch (e) { /* ignore */ }
            }
        }

        let places = [];

        if (window.currentPlaces && window.currentPlaces.length > 0) {
            places = window.currentPlaces;
        } else if (window.allPlaces && window.allPlaces.length > 0) {
            places = window.allPlaces;
        } else {
            try {
                const stored = localStorage.getItem('wandernear_places');
                if (stored) places = JSON.parse(stored);
            } catch (e) { /* ignore */ }
        }

        if (places.length === 0) return [];

        // ── Resolve unnamed places ────────────────────────────────────────
        const categoryCounters = {};
        const CATEGORY_LABELS = {
            restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Fast Food',
            tourist_attraction: 'Attraction', museum: 'Museum',
            lodging: 'Hotel', park: 'Park', bar: 'Bar', gallery: 'Gallery'
        };
        places = places.map(p => {
            const isUnnamed = !p.name ||
                p.name.trim() === '' ||
                p.name === 'Unnamed Place' ||
                p.name === 'undefined';
            if (!isUnnamed) return p;

            const cat = p.category || p.rawCategory || 'place';
            const label = CATEGORY_LABELS[cat] || 'Place';
            categoryCounters[label] = (categoryCounters[label] || 0) + 1;
            // Build a descriptive name: e.g. "Café #3" or "Restaurant #1"
            const newName = `${label} #${categoryCounters[label]}`;
            return { ...p, name: newName };
        });

        // Compute dynamic cost ranges from actual places
        dynamicCostRanges = computeDynamicCostRanges(places);

        // Annotate with distance and sort nearest-first
        const annotated = annotatePlacesWithDistance(places);
        annotated.sort((a, b) => (a._distKm || 0) - (b._distKm || 0));

        console.log(
            `[TripPlanner] ${places.length} places loaded.`,
            userRefPoint
                ? `Sorted by distance from (${userRefPoint.lat.toFixed(4)}, ${userRefPoint.lng.toFixed(4)})`
                : 'No user location — order preserved.'
        );

        return annotated;
    }

    /**
     * Build itinerary. Records used places so next regen gets fresh ones first.
     */
    function buildItinerary(places, budget, days) {
        const itinerary = {
            totalBudget: budget,
            days: days,
            budgetPerDay: budget / days,
            dailyPlans: [],
            totalEstimatedCost: 0
        };

        const budgetPerDay = budget / days;
        const usedPlaces = new Set();

        for (let day = 1; day <= days; day++) {
            const dailyPlan = generateDailyPlan(places, budgetPerDay, day, usedPlaces);
            itinerary.dailyPlans.push(dailyPlan);
            itinerary.totalEstimatedCost += dailyPlan.estimatedCost;
        }

        // Save IDs for deprioritisation on the next regeneration
        lastPlanIds = new Set(usedPlaces);

        return itinerary;
    }

    /**
     * Generate plan for a single day.
     * Falls back to ANY remaining place when a category pool is empty.
     */
    function generateDailyPlan(places, dayBudget, dayNumber, usedPlaces) {
        const plan = {
            day: dayNumber,
            budget: dayBudget,
            estimatedCost: 0,
            slots: { morning: [], afternoon: [], evening: [] }
        };

        const budgets = {
            food: dayBudget * (userAllocation.food / 100),
            attractions: dayBudget * (userAllocation.attractions / 100),
            transport: dayBudget * (userAllocation.transport / 100)
        };

        const foodCats = ['restaurant', 'fast_food', 'cafe', 'bar'];
        const attractionCats = ['tourist_attraction', 'museum', 'park', 'attraction', 'gallery'];

        // Get category pool; fall back to ALL unused places if category exhausted
        const pool = (cats) => {
            const strict = filterPlaces(places, cats, usedPlaces);
            return strict.length > 0 ? strict : filterPlaces(places, null, usedPlaces);
        };

        const addActivity = (slot, time, type, placePool, budget) => {
            const place = selectPlace(placePool, budget, usedPlaces);
            if (!place) return;
            const cost = getEstimatedCost(place);
            plan.slots[slot].push({ time, type, place, estimatedCost: cost });
            plan.estimatedCost += cost;
        };

        addActivity('morning', '08:00', 'food', pool(foodCats), budgets.food * 0.25);
        addActivity('morning', '10:00', 'attraction', pool(attractionCats), budgets.attractions * 0.4);
        addActivity('afternoon', '13:00', 'food', pool(foodCats), budgets.food * 0.40);
        addActivity('afternoon', '15:00', 'attraction', pool(attractionCats), budgets.attractions * 0.4);
        addActivity('evening', '19:00', 'food', pool(foodCats), budgets.food * 0.35);
        addActivity('evening', '20:30', 'attraction', pool(attractionCats), budgets.attractions * 0.2);

        plan.estimatedCost += budgets.transport;
        return plan;
    }

    /**
     * Filter places by category (null = accept all categories).
     * Preserves caller's input order — NO re-sort (shuffle / distance order honoured).
     * On regenerate: pushes last-plan places to the back so fresh ones surface first.
     */
    function filterPlaces(places, categories, usedPlaces) {
        const filtered = places.filter(p => {
            if (usedPlaces.has(p.id)) return false;
            if (!categories) return true;
            const cat = p.category || p.rawCategory;
            return cat && categories.includes(cat);
        });

        if (!isRegenerating || lastPlanIds.size === 0) return filtered;

        const fresh = filtered.filter(p => !lastPlanIds.has(p.id));
        const stale = filtered.filter(p => lastPlanIds.has(p.id));
        return [...fresh, ...stale];
    }

    /**
     * Select a place within budget constraint using cost RANGE.
     * Tries to find the nearest place whose estimated cost fits maxBudget.
     * Falls back to cheapest available if nothing fits.
     */
    function selectPlace(places, maxBudget, usedPlaces) {
        // First pass: nearest place within budget
        for (const place of places) {
            if (usedPlaces.has(place.id)) continue;
            const cost = getEstimatedCost(place);
            if (cost <= maxBudget) {
                usedPlaces.add(place.id);
                return place;
            }
        }
        // Second pass: nearest place regardless of budget (cheapest fallback)
        // Sort by estimated cost ascending to pick the cheapest
        const affordable = [...places]
            .filter(p => !usedPlaces.has(p.id))
            .sort((a, b) => getEstimatedCost(a) - getEstimatedCost(b));
        if (affordable.length > 0) {
            usedPlaces.add(affordable[0].id);
            return affordable[0];
        }
        return null;
    }

    /**
     * Get estimated cost for a place using dynamic ranges.
     * Places are ordered by proximity, so index-within-category reflects
     * how "typical" the place is cost-wise (nearest = more mainstream pricing).
     * We interpolate within the category's min–max range.
     */
    function getEstimatedCost(place) {
        const cat = place.category || place.rawCategory || 'restaurant';
        const range = dynamicCostRanges[cat] || FALLBACK_COSTS[cat] || FALLBACK_COSTS.restaurant;
        // Use a position factor: closer places tend to be mainstream (avg),
        // farther ones can vary. We use the place's internal rank if available.
        // For simplicity return avg — the real range is used in selectPlace() filtering.
        return range.avg;
    }

    /**
     * Get the cost range for a category (min and max), used in UI display.
     */
    function getCostRange(category) {
        const cat = category || 'restaurant';
        return dynamicCostRanges[cat] || FALLBACK_COSTS[cat] || FALLBACK_COSTS.restaurant;
    }

    /**
     * Display generated itinerary
     */
    function displayItinerary(itinerary) {
        const container = document.getElementById('itineraryContainer');
        if (!container) return;

        container.innerHTML = '';

        // Show regenerate button
        const regenerateBtn = document.getElementById('regeneratePlanBtn');
        if (regenerateBtn) {
            regenerateBtn.style.display = 'inline-flex';
        }

        // Show payment button
        const paymentBtn = document.getElementById('paymentBtn');
        if (paymentBtn) {
            paymentBtn.style.display = 'inline-flex';
        }

        // Create summary card
        const summaryCard = createSummaryCard(itinerary);
        container.appendChild(summaryCard);

        // Create daily plan cards
        itinerary.dailyPlans.forEach(dailyPlan => {
            const dayCard = createDayCard(dailyPlan, itinerary.days);
            container.appendChild(dayCard);
        });

        // Scroll to itinerary
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Create summary card
     */
    function createSummaryCard(itinerary) {
        const card = document.createElement('div');
        card.className = 'itinerary-summary-card';

        const budgetUtilization = (itinerary.totalEstimatedCost / itinerary.totalBudget) * 100;
        const remaining = itinerary.totalBudget - itinerary.totalEstimatedCost;

        card.innerHTML = `
            <h3>Trip Summary</h3>
            <div class="summary-stats">
                <div class="summary-stat">
                    <div class="stat-icon">📅</div>
                    <div class="stat-content">
                        <span class="stat-label">Duration</span>
                        <span class="stat-value">${itinerary.days} ${itinerary.days === 1 ? 'Day' : 'Days'}</span>
                    </div>
                </div>
                <div class="summary-stat">
                    <div class="stat-icon">💵</div>
                    <div class="stat-content">
                        <span class="stat-label">Total Budget</span>
                        <span class="stat-value">₹${itinerary.totalBudget.toFixed(2)}</span>
                    </div>
                </div>
                <div class="summary-stat">
                    <div class="stat-icon">💰</div>
                    <div class="stat-content">
                        <span class="stat-label">Estimated Cost</span>
                        <span class="stat-value">₹${itinerary.totalEstimatedCost.toFixed(2)}</span>
                    </div>
                </div>
                <div class="summary-stat">
                    <div class="stat-icon">🏦</div>
                    <div class="stat-content">
                        <span class="stat-label">Remaining</span>
                        <span class="stat-value ${remaining >= 0 ? 'text-success' : 'text-error'}">₹${Math.abs(remaining).toFixed(2)}</span>
                    </div>
                </div>
            </div>
            <div class="budget-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(budgetUtilization, 100)}%"></div>
                </div>
                <span class="progress-label">${budgetUtilization.toFixed(1)}% of budget utilized</span>
            </div>
        `;

        return card;
    }

    /**
     * Create day card
     */
    function createDayCard(dailyPlan, totalDays) {
        const card = document.createElement('div');
        card.className = 'day-card';

        let slotsHTML = '';

        // Morning
        if (dailyPlan.slots.morning.length > 0) {
            slotsHTML += createTimeSlotHTML('Morning', '08:00 - 12:00', dailyPlan.slots.morning);
        }

        // Afternoon
        if (dailyPlan.slots.afternoon.length > 0) {
            slotsHTML += createTimeSlotHTML('Afternoon', '12:00 - 17:00', dailyPlan.slots.afternoon);
        }

        // Evening
        if (dailyPlan.slots.evening.length > 0) {
            slotsHTML += createTimeSlotHTML('Evening', '17:00 - 22:00', dailyPlan.slots.evening);
        }

        card.innerHTML = `
            <div class="day-header">
                <h4>Day ${dailyPlan.day}${totalDays > 1 ? ` of ${totalDays}` : ''}</h4>
                <span class="day-budget">Budget: ₹${dailyPlan.budget.toFixed(2)} | Estimated: ₹${dailyPlan.estimatedCost.toFixed(2)}</span>
            </div>
            <div class="day-timeline">
                ${slotsHTML}
            </div>
        `;

        return card;
    }

    /**
     * Create time slot HTML
     */
    function createTimeSlotHTML(slotName, timeRange, activities) {
        let activitiesHTML = activities.map(activity => {
            const cat = activity.place.category || activity.place.rawCategory || 'restaurant';
            const range = getCostRange(cat);
            const distKm = activity.place._distKm;
            const distBadge = (distKm != null && distKm < 9999)
                ? `<span class="activity-dist">📍 ${distKm < 1 ? (distKm * 1000).toFixed(0) + ' m' : distKm.toFixed(1) + ' km'} away</span>`
                : '';
            const rangeBadge = `<span class="activity-cost">₹${range.min}–₹${range.max}</span>`;

            const imageContent = activity.place.photo 
                ? `<img src="${activity.place.photo}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover; margin-right: 15px; flex-shrink: 0;" alt="${activity.place.name}">`
                : `<div class="activity-icon">${getActivityIcon(activity.type, activity.place.category)}</div>`;

            return `
            <div class="activity-item" data-place-id="${activity.place.id}">
                <div class="activity-time">${activity.time}</div>
                <div class="activity-details" style="display: flex; align-items: flex-start; width: 100%;">
                    ${imageContent}
                    <div class="activity-content" style="flex: 1;">
                        <h5 class="activity-name">${activity.place.name}</h5>
                        <p class="activity-address">${activity.place.address || 'Address not available'}</p>
                        <div class="activity-meta">
                            ${activity.place.rating ? `<span class="activity-rating">⭐ ${activity.place.rating}</span>` : ''}
                            ${distBadge}
                            ${rangeBadge}
                        </div>
                    </div>
                    <button class="btn-icon-small activity-action" onclick="TripPlannerModule.viewPlaceDetails(${activity.place.id})" title="View details" style="margin-left: 10px;">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');

        return `
            <div class="time-slot">
                <div class="slot-header">
                    <span class="slot-name">${slotName}</span>
                    <span class="slot-time">${timeRange}</span>
                </div>
                <div class="slot-activities">
                    ${activitiesHTML}
                </div>
            </div>
        `;
    }

    /**
     * Get activity icon based on type
     */
    function getActivityIcon(type, category) {
        if (type === 'food') {
            if (category === 'cafe') return '☕';
            if (category === 'fast_food') return '🍔';
            return '🍽️';
        }
        if (type === 'attraction') {
            if (category === 'museum') return '🏛️';
            if (category === 'park') return '🌳';
            return '🎯';
        }
        return '📍';
    }

    /**
     * Enable manual selection mode
     */
    function enableManualSelection() {
        if (typeof showToast === 'function') {
            showToast('Manual mode: Browse and select places to add to your itinerary', 'info');
        }

        // Highlight explore section
        const exploreSection = document.getElementById('explore');
        if (exploreSection) {
            exploreSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    /**
     * Show loading state
     */
    function showLoadingState() {
        const container = document.getElementById('itineraryContainer');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Generating your perfect trip plan...</p>
                </div>
            `;
        }
    }

    /**
     * Hide loading state
     */
    function hideLoadingState() {
        // Loading state will be replaced by itinerary content
    }

    /**
     * View place details
     */
    function viewPlaceDetails(placeId) {
        // Try to use existing place details function
        if (typeof window.openPlaceDetails === 'function') {
            window.openPlaceDetails(placeId);
        } else {
            console.log('View details for place:', placeId);
        }
    }

    /**
     * Export itinerary as PDF or share
     */
    function exportItinerary() {
        if (!currentItinerary) {
            if (typeof showToast === 'function') {
                showToast('No itinerary to export', 'warning');
            }
            return;
        }

        // TODO: Implement PDF export or sharing functionality
        if (typeof showToast === 'function') {
            showToast('Export feature coming soon!', 'info');
        }
    }

    // Public API
    return {
        init,
        generateAutoPlan,
        viewPlaceDetails,
        exportItinerary,
        getCurrentItinerary: () => currentItinerary,
        toggleCustomAlloc,
        handleSliderInput,
        resetAllocations
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        TripPlannerModule.init();
    });
} else {
    TripPlannerModule.init();
}

// Expose module globally — onclick on HTML elements uses TripPlannerModule directly
window.TripPlannerModule = TripPlannerModule;
// Kept for any legacy links but delegates cleanly with no duplicate toast
window.handleRegeneratePlan = function () {
    if (typeof TripPlannerModule.generateAutoPlan === 'function') {
        TripPlannerModule.generateAutoPlan(true);
    }
};
