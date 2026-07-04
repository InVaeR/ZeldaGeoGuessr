const Scoring = {

    distance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    },

    score(distance) {
        if (!isFinite(distance) || distance < 0) return 0;
        const d = CONFIG.CALIBRATION_D;
        if (!isFinite(d) || d <= 0) return 0;

        const s = CONFIG.MAX_ROUND_SCORE * Math.exp(-distance / d);
        const rounded = Math.round(s);
        return Math.max(0, Math.min(CONFIG.MAX_ROUND_SCORE, rounded));
    },

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
        const ppm = CONFIG.PX_PER_METER;
        if (!isFinite(ppm) || ppm <= 0) return 0;
        return pxDist / ppm;
    },

    /** Форматирование расстояния в метрах (м / км) */
    formatDistance(meters) {
        if (!isFinite(meters) || meters < 0) return '—';
        if (meters >= 1000) {
            return (meters / 1000).toFixed(2) + ' км';
        }
        return Math.round(meters) + ' м';
    }
};