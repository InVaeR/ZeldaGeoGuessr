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

        let tileErrors = 0;
        const TILE_ERROR_THRESHOLD = 3;
        layer.on('tileerror', function () {
            tileErrors++;
            if (tileErrors < TILE_ERROR_THRESHOLD) return;
            map.removeLayer(layer);
            GameMap._fallbackToImage(map);
        });
    },

    _fallbackToImage(map) {
        const bounds = this.getBounds();
        const img = new Image();
        img.onload = function () {
            L.imageOverlay(CONFIG.MAP_IMAGE, bounds).addTo(map);
        };
        img.onerror = function () {
            const div = L.divIcon({
                className: '',
                html: '<div style="width:100%;text-align:center;padding:40px;color:#888;">Карта не загружена (нет тайлов и нет map_high.jpg)</div>',
                iconSize: [300, 40]
            });
            L.marker(bounds.getCenter(), { icon: div, interactive: false }).addTo(map);
        };
        img.src = CONFIG.MAP_IMAGE;
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
