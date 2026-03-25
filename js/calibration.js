/* ==========================================================
   calibration.js — Режим калибровки
   ========================================================== */

const Calibration = {

    map: null,
    pointA: null,
    pointB: null,
    markerA: null,
    markerB: null,
    line: null,
    clickCount: 0,
    currentD: 2000,

    // ========================
    //  ЗАПУСК / ЗАКРЫТИЕ
    // ========================

    open() {
        this.currentD = CONFIG.CALIBRATION_D;

        UI.showScreen('calibration');

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        setTimeout(() => {
            this.map = GameMap.create('calibration-map');
            this._bindEvents();
            this._updateSlider();
            this._updateScoreTable();
            this.clear();
        }, 100);
    },

    close() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        UI.showScreen('menu');
    },

    // ========================
    //  СОБЫТИЯ
    // ========================

    _bindEvents() {
        const self = this;

        // Клик по карте
        this.map.on('click', (e) => self._onMapClick(e));

        // Координаты под курсором
        this.map.on('mousemove', (e) => {
            const px = GameMap.latLngToPx(e.latlng);
            const x = Math.round(px.x);
            const y = Math.round(px.y);
            document.getElementById('cal-cursor-coords').textContent =
                `X: ${x}, Y: ${y}`;
        });

        this.map.on('mouseout', () => {
            document.getElementById('cal-cursor-coords').textContent = '—';
        });

        // Кнопки
        document.getElementById('btn-cal-back').addEventListener('click', () => self.close());
        document.getElementById('btn-cal-clear').addEventListener('click', () => self.clear());
        document.getElementById('btn-cal-apply').addEventListener('click', () => self._applyD());

        // Слайдер D
        const slider = document.getElementById('cal-d-slider');
        const input = document.getElementById('cal-d-input');

        slider.addEventListener('input', () => {
            input.value = slider.value;
            self.currentD = parseInt(slider.value);
            self._onDChanged();
        });

        input.addEventListener('input', () => {
            let val = parseInt(input.value);
            if (isNaN(val) || val < 100) val = 100;
            if (val > 10000) val = 10000;
            slider.value = Math.min(Math.max(val, 200), 5000);
            self.currentD = val;
            self._onDChanged();
        });
    },

    // ========================
    //  КЛИК ПО КАРТЕ
    // ========================

    _onMapClick(e) {
        const px = GameMap.latLngToPx(e.latlng);
        const x = Math.round(px.x);
        const y = Math.round(px.y);

        if (this.clickCount === 0) {
            // Первая точка
            this._clearMarkers();
            this.pointA = { x, y };
            this.markerA = GameMap.createGuessMarker(e.latlng)
                .bindPopup(`A: (${x}, ${y})`)
                .addTo(this.map);

            document.getElementById('cal-point-a').textContent = `(${x}, ${y})`;
            document.getElementById('cal-point-b').textContent = 'Кликните ещё раз';
            document.getElementById('cal-results').style.display = 'none';

            this.clickCount = 1;

        } else if (this.clickCount === 1) {
            // Вторая точка
            this.pointB = { x, y };
            this.markerB = GameMap.createCorrectMarker(e.latlng)
                .bindPopup(`B: (${x}, ${y})`)
                .addTo(this.map);

            document.getElementById('cal-point-b').textContent = `(${x}, ${y})`;

            // Линия
            const latLngA = GameMap.pxToLatLng(this.pointA.x, this.pointA.y);
            const latLngB = e.latlng;
            this.line = GameMap.createResultLine(latLngA, latLngB).addTo(this.map);

            this._updateResults();
            this.clickCount = 2;

        } else {
            // Третий клик — начинаем заново с новой точкой A
            this.clickCount = 0;
            this._onMapClick(e);
        }
    },

    // ========================
    //  РЕЗУЛЬТАТЫ
    // ========================

    _updateResults() {
        if (!this.pointA || !this.pointB) return;

        const dist = Scoring.distance(
            this.pointA.x, this.pointA.y,
            this.pointB.x, this.pointB.y
        );

        const score = this._calcScore(dist, this.currentD);

        document.getElementById('cal-distance').textContent = Math.round(dist);
        document.getElementById('cal-score').textContent = score;
        document.getElementById('cal-results').style.display = 'block';
    },

    _calcScore(distance, d) {
        return Math.round(CONFIG.MAX_ROUND_SCORE * Math.exp(-distance / d));
    },

    // ========================
    //  СЛАЙДЕР D
    // ========================

    _onDChanged() {
        document.getElementById('cal-d-label').textContent = this.currentD;
        this._updateResults();
        this._updateScoreTable();
    },

    _updateSlider() {
        document.getElementById('cal-d-slider').value =
            Math.min(Math.max(this.currentD, 200), 5000);
        document.getElementById('cal-d-input').value = this.currentD;
        document.getElementById('cal-d-label').textContent = this.currentD;
    },

    _updateScoreTable() {
        const distances = [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000];
        const d = this.currentD;
        let html = '<div class="cal-table-header"><span>Расстояние</span><span>Очки</span></div>';

        distances.forEach(dist => {
            const score = this._calcScore(dist, d);
            const pct = (score / CONFIG.MAX_ROUND_SCORE * 100).toFixed(1);
            html += `
                <div class="cal-table-row">
                    <span>${dist.toLocaleString()} px</span>
                    <span class="cal-table-score">${score.toLocaleString()}</span>
                    <span class="cal-table-pct">${pct}%</span>
                </div>
            `;
        });

        document.getElementById('cal-score-table').innerHTML = html;
    },

    // =========================
    //  ПРИМЕНИТЬ D
    // =========================

    _applyD() {
        CONFIG.CALIBRATION_D = this.currentD;
        const btn = document.getElementById('btn-cal-apply');
        btn.textContent = `✓ D = ${this.currentD} применено`;
        setTimeout(() => {
            btn.textContent = 'Применить D к игре';
        }, 2000);
    },

    // =========================
    //  СБРОС
    // =========================

    clear() {
        this._clearMarkers();
        this.pointA = null;
        this.pointB = null;
        this.clickCount = 0;

        document.getElementById('cal-point-a').textContent = 'Кликните на карту';
        document.getElementById('cal-point-b').textContent = 'Кликните ещё раз';
        document.getElementById('cal-results').style.display = 'none';
    },

    _clearMarkers() {
        if (this.markerA && this.map) { this.map.removeLayer(this.markerA); this.markerA = null; }
        if (this.markerB && this.map) { this.map.removeLayer(this.markerB); this.markerB = null; }
        if (this.line && this.map) { this.map.removeLayer(this.line); this.line = null; }
    }
};