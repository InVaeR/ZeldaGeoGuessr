const CONFIG = {
    MAP_WIDTH: 18000,
    MAP_HEIGHT: 15000,

    MIN_ZOOM: -3,
    MAX_ZOOM: 1,

    USE_TILES: window.location.protocol !== 'file:',

    TILES_PATH: 'map_tiles',
    TILE_SIZE: 512,

    MAP_IMAGE: 'map/map_high.jpg',

    MAX_ROUND_SCORE: 5000,
    CALIBRATION_D: 2000,

    LOCS_PATH: 'locs',

    // === Пересчёт координат: пиксели карты ↔ игровые метры ===
    // Опорная точка: игровая (ANCHOR_GAME_X, ANCHOR_GAME_Y) = пиксельная (ANCHOR_PX_X, ANCHOR_PX_Y)
    ANCHOR_PX_X: 8980,
    ANCHOR_PX_Y: 6930,
    ANCHOR_GAME_X: -254,
    ANCHOR_GAME_Y: -426,

    // Масштаб: сколько пикселей карты в 1 игровом метре
    PX_PER_METER: 1.5
};