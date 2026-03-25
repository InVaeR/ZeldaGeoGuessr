/* ==========================================================
   ui.js — Управление экранами и DOM-элементами
   ========================================================== */

const UI = {

    screens: {
        menu: document.getElementById('screen-menu'),
        game: document.getElementById('screen-game'),
        roundResult: document.getElementById('screen-round-result'),
        final: document.getElementById('screen-final'),
        tools: document.getElementById('screen-tools')
    },

    els: {
        seriesList: document.getElementById('series-list'),
        hudSeriesName: document.getElementById('hud-series-name'),
        hudRound: document.getElementById('hud-round'),
        hudTotal: document.getElementById('hud-total'),
        hudScore: document.getElementById('hud-score'),
        locationImage: document.getElementById('location-image'),
        locationPanel: document.getElementById('location-panel'),
        btnToggleImage: document.getElementById('btn-toggle-image'),
        btnConfirm: document.getElementById('btn-confirm'),
        resultDistance: document.getElementById('result-distance'),
        resultRoundScore: document.getElementById('result-round-score'),
        resultTotalScore: document.getElementById('result-total-score'),
        btnNextRound: document.getElementById('btn-next-round'),
        finalSummary: document.getElementById('final-summary'),
        finalScore: document.getElementById('final-score'),
        btnBackMenu: document.getElementById('btn-back-menu')
    },

    // ========================
    //  VIEWER STATE
    // ========================

    viewer: {
        zoom: 1,
        minZoom: 0.1,
        maxZoom: 10,
        panX: 0,
        panY: 0,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        panStartX: 0,
        panStartY: 0,
        imgWidth: 0,
        imgHeight: 0,
        lastMouseX: -1,
        lastMouseY: -1
    },

    // ========================
    //  ЭКРАНЫ
    // ========================

    showScreen(name) {
        Object.values(this.screens).forEach(s => s.classList.remove('active'));
        this.screens[name].classList.add('active');
    },

    // ========================
    //  HUD
    // ========================

    updateHUD(seriesName, round, total, score) {
        this.els.hudSeriesName.textContent = seriesName;
        this.els.hudRound.textContent = round;
        this.els.hudTotal.textContent = total;
        this.els.hudScore.textContent = score;
    },

    // ========================
    //  КАРТИНКА ЛОКАЦИИ
    // ========================

    showLocationImage(imagePath) {
        this.els.locationImage.src = `${CONFIG.LOCS_PATH}/${imagePath}`;
        this.els.locationPanel.classList.remove('collapsed');
        this.els.btnToggleImage.textContent = '▼';
    },

    toggleImage() {
        const panel = this.els.locationPanel;
        panel.classList.toggle('collapsed');

        if (panel.classList.contains('collapsed')) {
            this.els.btnToggleImage.textContent = '👁️';
            this.els.btnToggleImage.title = 'Показать изображение';
        } else {
            this.els.btnToggleImage.textContent = '▼';
            this.els.btnToggleImage.title = 'Свернуть';
        }
    },

    // ========================
    //  КНОПКА ПОДТВЕРЖДЕНИЯ
    // ========================

    setConfirmEnabled(enabled) {
        this.els.btnConfirm.disabled = !enabled;
    },

    // ========================
    //  РЕЗУЛЬТАТЫ
    // ========================

    showRoundResult(distance, roundScore, totalScore, isLastRound) {
        this.els.resultDistance.textContent = Math.round(distance);
        this.els.resultRoundScore.textContent = roundScore;
        this.els.resultTotalScore.textContent = totalScore;
        this.els.btnNextRound.textContent = isLastRound ? 'Результаты' : 'Следующий раунд';
    },

    showFinalResults(roundResults, totalScore) {
        let html = '';
        roundResults.forEach((r) => {
            html += `
                <div class="final-round-row">
                    <span class="round-label">Раунд ${r.roundNum}</span>
                    <span class="round-distance">${r.distance} px</span>
                    <span class="round-score">${r.score}</span>
                </div>
            `;
        });
        this.els.finalSummary.innerHTML = html;
        this.els.finalScore.textContent = totalScore;
    },

    // ========================
    //  СПИСОК СЕРИЙ
    // ========================

    renderSeriesList(seriesList, onSelect) {
        this.els.seriesList.innerHTML = '';
        seriesList.forEach((series, index) => {
            const btn = document.createElement('button');
            btn.className = 'btn-series';
            btn.textContent = series.name;
            btn.addEventListener('click', () => onSelect(index));
            this.els.seriesList.appendChild(btn);
        });
    },

    // ========================
    //  ПРОСМОТРЩИК ИЗОБРАЖЕНИЙ
    // ========================

    createImageOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'image-overlay';
        overlay.innerHTML = `
            <div id="viewer-controls">
                <span class="viewer-title">Просмотр локации</span>
                <div class="viewer-buttons">
                    <button class="viewer-btn" id="viewer-zoom-in" title="Приблизить">+</button>
                    <button class="viewer-btn" id="viewer-zoom-out" title="Отдалить">−</button>
                    <button class="viewer-btn" id="viewer-reset" title="Сбросить">⟲</button>
                    <button class="viewer-btn viewer-btn-close" id="viewer-close" title="Закрыть">✕</button>
                </div>
            </div>
            <div id="viewer-container">
                <img id="viewer-image" src="" alt="Локация" />
                <div id="viewer-zoom-level">100%</div>
            </div>
        `;
        document.body.appendChild(overlay);

        this._initViewerEvents();
    },

    _initViewerEvents() {
        const self = this;
        const container = document.getElementById('viewer-container');

        // Отслеживаем позицию мыши внутри контейнера
        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            self.viewer.lastMouseX = e.clientX - rect.left;
            self.viewer.lastMouseY = e.clientY - rect.top;
        });

        container.addEventListener('mouseleave', () => {
            self.viewer.lastMouseX = -1;
            self.viewer.lastMouseY = -1;
        });

        // Кнопки
        document.getElementById('viewer-close').addEventListener('click', () => self.closeViewer());
        document.getElementById('viewer-zoom-in').addEventListener('click', () => self._viewerZoomToPoint(1.5));
        document.getElementById('viewer-zoom-out').addEventListener('click', () => self._viewerZoomToPoint(1 / 1.5));
        document.getElementById('viewer-reset').addEventListener('click', () => self._viewerFit());

        // Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') self.closeViewer();
        });

        // Колёсико — зум к курсору
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            self._viewerZoomAt(factor, mx, my);
        }, { passive: false });

        // Перетаскивание
        container.addEventListener('mousedown', (e) => {
            e.preventDefault();
            self.viewer.isDragging = true;
            self.viewer.dragStartX = e.clientX;
            self.viewer.dragStartY = e.clientY;
            self.viewer.panStartX = self.viewer.panX;
            self.viewer.panStartY = self.viewer.panY;
            container.classList.add('dragging');
        });

        window.addEventListener('mousemove', (e) => {
            if (!self.viewer.isDragging) return;
            self.viewer.panX = self.viewer.panStartX + (e.clientX - self.viewer.dragStartX);
            self.viewer.panY = self.viewer.panStartY + (e.clientY - self.viewer.dragStartY);
            self._viewerApply();
        });

        window.addEventListener('mouseup', () => {
            if (self.viewer.isDragging) {
                self.viewer.isDragging = false;
                document.getElementById('viewer-container').classList.remove('dragging');
            }
        });

        // Двойной клик — сброс
        container.addEventListener('dblclick', () => self._viewerFit());
    },

    openImageFullscreen() {
        const overlay = document.getElementById('image-overlay');
        const img = document.getElementById('viewer-image');
        const self = this;

        img.src = this.els.locationImage.src;
        overlay.classList.add('active');

        const doFit = () => {
            self.viewer.imgWidth = img.naturalWidth;
            self.viewer.imgHeight = img.naturalHeight;

            // Ждём пока контейнер получит размеры после display:flex
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    self._viewerFit();
                });
            });
        };

        if (img.complete && img.naturalWidth > 0) {
            doFit();
        } else {
            img.onload = doFit;
        }
    },

    closeViewer() {
        document.getElementById('image-overlay').classList.remove('active');
    },

    /**
     * Вписать изображение по центру контейнера
     */
    _viewerFit() {
        const container = document.getElementById('viewer-container');
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const v = this.viewer;

        if (!cw || !ch || !v.imgWidth || !v.imgHeight) return;

        const pad = 40;
        const fitZoom = Math.min(
            (cw - pad * 2) / v.imgWidth,
            (ch - pad * 2) / v.imgHeight,
            1
        );

        v.zoom = fitZoom;

        const dispW = v.imgWidth * fitZoom;
        const dispH = v.imgHeight * fitZoom;

        v.panX = (cw - dispW) / 2;
        v.panY = (ch - dispH) / 2;

        this._viewerApply();
    },

    /**
     * Зум кнопками — к курсору если он внутри, иначе к центру
     */
    _viewerZoomToPoint(factor) {
        const container = document.getElementById('viewer-container');
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const v = this.viewer;

        let px = cw / 2;
        let py = ch / 2;

        if (v.lastMouseX >= 0 && v.lastMouseX <= cw &&
            v.lastMouseY >= 0 && v.lastMouseY <= ch) {
            px = v.lastMouseX;
            py = v.lastMouseY;
        }

        this._viewerZoomAt(factor, px, py);
    },

    /**
     * Зум к точке (px, py) в координатах контейнера
     */
    _viewerZoomAt(factor, px, py) {
        const v = this.viewer;
        const oldZoom = v.zoom;
        const newZoom = Math.max(v.minZoom, Math.min(v.maxZoom, oldZoom * factor));

        if (newZoom === oldZoom) return;

        const imgX = (px - v.panX) / oldZoom;
        const imgY = (py - v.panY) / oldZoom;

        v.panX = px - imgX * newZoom;
        v.panY = py - imgY * newZoom;
        v.zoom = newZoom;

        this._viewerApply();
    },

    /**
     * Применить текущие pan/zoom к DOM
     */
    _viewerApply() {
        const img = document.getElementById('viewer-image');
        const label = document.getElementById('viewer-zoom-level');
        const v = this.viewer;

        img.style.transformOrigin = '0 0';
        img.style.transform = `translate(${v.panX}px, ${v.panY}px) scale(${v.zoom})`;

        label.textContent = `${Math.round(v.zoom * 100)}%`;
    }
};