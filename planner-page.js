/**
 * Trip Planner page setup: theme and places sync from Explore tab via localStorage
 */
(function () {
    'use strict';

    const THEME_STORAGE_KEY = 'wandernear-theme';
    const PLACES_STORAGE_KEY = 'wandernear_places';

    function applyTheme(theme, options) {
        const persist = options && options.persist !== false;
        const root = document.documentElement;
        const toggleBtn = document.getElementById('themeToggle');
        const icon = toggleBtn ? toggleBtn.querySelector('i') : null;

        if (theme === 'dark') {
            root.setAttribute('data-theme', 'dark');
        } else {
            root.removeAttribute('data-theme');
            theme = 'light';
        }

        if (icon) {
            icon.classList.remove('fa-moon', 'fa-sun');
            icon.classList.add(theme === 'dark' ? 'fa-sun' : 'fa-moon');
        }

        if (persist) {
            try {
                localStorage.setItem(THEME_STORAGE_KEY, theme);
            } catch (e) {}
        }
    }

    function initTheme() {
        var savedTheme = null;
        try {
            savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        } catch (e) {}
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        var initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(initialTheme, { persist: false });
        var toggleBtn = document.getElementById('themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                applyTheme(isDark ? 'light' : 'dark');
            });
        }
    }

    function syncPlacesFromStorage() {
        try {
            var raw = localStorage.getItem(PLACES_STORAGE_KEY);
            if (raw) {
                var places = JSON.parse(raw);
                if (Array.isArray(places) && places.length > 0) {
                    window.allPlaces = places;
                    window.currentPlaces = places;
                    return places.length;
                }
            }
        } catch (e) {}
        window.allPlaces = [];
        window.currentPlaces = [];
        return 0;
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        initTheme();
        syncPlacesFromStorage();
        window.addEventListener('storage', function (e) {
            if (e.key === PLACES_STORAGE_KEY && e.newValue) {
                try {
                    var places = JSON.parse(e.newValue);
                    if (Array.isArray(places)) {
                        window.allPlaces = places;
                        window.currentPlaces = places;
                    }
                } catch (err) {}
            }
        });
    }

    init();
})();
