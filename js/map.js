/* ==========================================================
   map.js — Работа с Leaflet картой
   ========================================================== */

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
        return map;
    },

    // ========================
    //  ТАЙЛОВЫЙ СЛОЙ
    // ========================

    _addTileLayer(map) {
        // Используем L.TileLayer с кастомным URL
        // Leaflet в CRS.Simple запрашивает тайлы по координатам {x}, {y}, {z}
        // Наши файлы: map_tiles/{z}/{x}_{y}.jpg

        L.TileLayer.CustomSimple = L.TileLayer.extend({
            getTileUrl: function (coords) {
                return `${CONFIG.TILES_PATH}/${coords.z}/${coords.x}_${coords.y}.jpg`;
            }
        });

        new L.TileLayer.CustomSimple('', {
            tileSize: CONFIG.TILE_SIZE,
            minZoom: CONFIG.MIN_ZOOM,
            maxZoom: CONFIG.MAX_ZOOM,
            noWrap: true,
            bounds: this.getBounds()
        }).addTo(map);
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

    createGuessMarker(latlng) {
        return L.marker(latlng, {
            icon: L.divIcon({
                className: 'guess-icon',
                html: `<div style="
                    width: 20px; height: 20px;
                    background: #e94560;
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                "></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        });
    },

    createCorrectMarker(latlng) {
        return L.marker(latlng, {
            icon: L.divIcon({
                className: 'guess-icon',
                html: `<div style="
                    width: 20px; height: 20px;
                    background: #4ade80;
                    border: 3px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                "></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        });
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