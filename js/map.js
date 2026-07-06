// ============================================================================
// map.js — Работа с Leaflet картой
// ============================================================================

const GameMap = {

    // ========================
    //  КООРДИНАТЫ
    // ========================

    pxToLatLng(x, y) {
        return L.latLng(-y, x);
    },

    latLngToPx(latlng) {
        return { x: latlng.lng, y: -latlng.lat };
    },

    getBounds() {
        const sw = this.pxToLatLng(0, CONFIG.MAP_HEIGHT);
        const ne = this.pxToLatLng(CONFIG.MAP_WIDTH, 0);
        return L.latLngBounds(sw, ne);
    },

    // ========================
    //  СОЗДАНИЕ КАРТЫ
    // ========================

    create(containerId) {
        const bounds = this.getBounds();

        const map = L.map(containerId, {
            crs: L.CRS.Simple,
            minZoom: CONFIG.MIN_ZOOM,
            maxZoom: CONFIG.MAX_ZOOM,
            maxBounds: bounds.pad(0.5),
            maxBoundsViscosity: 0.8
        });

        if (CONFIG.USE_TILES) {
            this._addTileLayer(map);
        } else {
            L.imageOverlay(CONFIG.MAP_IMAGE, bounds).addTo(map);
        }

        map.fitBounds(bounds);

        // Дополнительно — пересчёт размеров после раскладки
        requestAnimationFrame(() => {
            requestAnimationFrame(() => map.invalidateSize());
        });

        return map;
    },

    /**
     * Безопасно пересоздать карту, удалив старую.
     */
    recreate(containerId, prevMap) {
        if (prevMap) {
            try { prevMap.remove(); } catch (_) {}
        }
        return this.create(containerId);
    },

    // ========================
    //  ТАЙЛОВЫЙ СЛОЙ
    // ========================

    _addTileLayer(map) {
        if (!L.TileLayer.CustomSimple) {
            L.TileLayer.CustomSimple = L.TileLayer.extend({
                getTileUrl(coords) {
                    return `${CONFIG.TILES_PATH}/${coords.z}/${coords.x}_${coords.y}.jpg`;
                }
            });
        }

        const layer = new L.TileLayer.CustomSimple('', {
            tileSize: CONFIG.TILE_SIZE,
            minZoom: CONFIG.MIN_ZOOM,
            maxZoom: CONFIG.MAX_ZOOM,
            noWrap: true,
            bounds: this.getBounds()
        }).addTo(map);

        let fallbackDone = false;
        layer.on('tileerror', () => {
            if (fallbackDone) return;
            fallbackDone = true;
            map.removeLayer(layer);
            const bounds = this.getBounds();
            L.imageOverlay(CONFIG.MAP_IMAGE, bounds).addTo(map);
        });
    },

    // ========================
    //  УПРАВЛЕНИЕ
    // ========================

    resetView(map) {
        map.fitBounds(this.getBounds());
    },

    // ========================
    //  МАРКЕРЫ
    // ========================

    /**
     * @param {L.LatLng} latlng
     * @param {{ variant?: 'guess'|'correct', size?: number }} [opts]
     */
    createMarker(latlng, opts = {}) {
        const variant = opts.variant || 'guess';
        const size = opts.size || 20;
        return L.marker(latlng, {
            icon: L.divIcon({
                className: `map-marker map-marker--${variant}`,
                html: '<span class="map-marker__dot"></span>',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            })
        });
    },

    createGuessMarker(latlng) {
        return this.createMarker(latlng, { variant: 'guess' });
    },

    createCorrectMarker(latlng) {
        return this.createMarker(latlng, { variant: 'correct' });
    },

    createResultLine(from, to) {
        return L.polyline([from, to], {
            color: '#ffd700',
            weight: 3,
            dashArray: '8, 8',
            opacity: 0.8
        });
    }
};
