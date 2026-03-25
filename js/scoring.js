const Scoring = {

    distance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    },

    score(distance) {
        const s = CONFIG.MAX_ROUND_SCORE * Math.exp(-distance / CONFIG.CALIBRATION_D);
        return Math.round(s);
    },

    // === Пересчёт координат ===

    /** Пиксели карты → игровые координаты */
    pxToGame(px, py) {
        return {
            x: (px - CONFIG.ANCHOR_PX_X) / CONFIG.PX_PER_METER + CONFIG.ANCHOR_GAME_X,
            y: (py - CONFIG.ANCHOR_PX_Y) / CONFIG.PX_PER_METER + CONFIG.ANCHOR_GAME_Y
        };
    },

    /** Игровые координаты → пиксели карты */
    gameToPx(gx, gy) {
        return {
            x: (gx - CONFIG.ANCHOR_GAME_X) * CONFIG.PX_PER_METER + CONFIG.ANCHOR_PX_X,
            y: (gy - CONFIG.ANCHOR_GAME_Y) * CONFIG.PX_PER_METER + CONFIG.ANCHOR_PX_Y
        };
    },

    /** Расстояние в пикселях → расстояние в метрах */
    pxDistanceToMeters(pxDist) {
        return pxDist / CONFIG.PX_PER_METER;
    },

    /** Форматирование расстояния в метрах (м / км) */
    formatDistance(meters) {
        if (meters >= 1000) {
            return (meters / 1000).toFixed(2) + ' км';
        }
        return Math.round(meters) + ' м';
    }
};