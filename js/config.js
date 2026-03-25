const CONFIG = {
    MAP_WIDTH: 18000,
    MAP_HEIGHT: 15000,

    // Расширяем диапазон зума
    MIN_ZOOM: -5,
    MAX_ZOOM: 1,

    USE_TILES: window.location.protocol !== 'file:',

    TILES_PATH: 'map_tiles',
    TILE_SIZE: 512,

    MAP_IMAGE: 'map/map_high.jpg',

    MAX_ROUND_SCORE: 5000,
    CALIBRATION_D: 2000,

    LOCS_PATH: 'locs'
};