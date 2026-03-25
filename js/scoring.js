/* ==========================================================
   scoring.js — Подсчёт расстояния и очков
   ========================================================== */

const Scoring = {

    /**
     * Расстояние между двумя точками в пикселях
     */
    distance(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Очки за раунд по расстоянию
     * S = 5000 × e^(−d / D)
     */
    score(distance) {
        const s = CONFIG.MAX_ROUND_SCORE * Math.exp(-distance / CONFIG.CALIBRATION_D);
        return Math.round(s);
    }
};