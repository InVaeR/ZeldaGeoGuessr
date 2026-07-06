const Api = {
    get isServer() { return CONFIG.IS_SERVER; },

    async saveSeries(data) {
        const r = await fetch('/api/series/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!r.ok) {
            const text = await r.text().catch(() => '');
            throw new Error(`HTTP ${r.status}: ${text || 'Ошибка сохранения'}`);
        }
        return r.json();
    },

    async uploadLocation(file, filename) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('filename', filename);
        const r = await fetch('/api/upload-location', { method: 'POST', body: formData });
        if (!r.ok) {
            const text = await r.text().catch(() => '');
            throw new Error(`HTTP ${r.status}: ${text || 'Ошибка загрузки'}`);
        }
        return r.json();
    }
};

const Tools = {

    map: null,
    activeTab: 'tab-calibration',
    _uiBound: false,

    cal: {
        pointA: null,
        pointB: null,
        markerA: null,
        markerB: null,
        line: null,
        clickCount: 0,
        currentD: 2000
    },

    editor: {
        data: null,
        selectedSeries: -1,
        selectedRound: -1,
        editMarker: null,
        dirty: false
    },

    // ================================================
    //  ОТКРЫТИЕ / ЗАКРЫТИЕ
    // ================================================

    open() {
        this.cal.currentD = CONFIG.CALIBRATION_D;
        this.editor.data = structuredClone(LOCATIONS_DATA);
        this.editor.dirty = false;

        UI.showScreen('tools');

        this.map = GameMap.recreate('tools-map', this.map);

        this._bindMapEvents();
        this._bindUiEventsOnce();

        this._calUpdateSlider();
        this._calUpdateScoreTable();
        this._calClear();
        this._editorRenderSeries();
        this._switchTab('tab-calibration');
    },

    close() {
        if (this.editor.dirty) {
            LOCATIONS_DATA.series = structuredClone(this.editor.data.series);
            this.editor.data = structuredClone(LOCATIONS_DATA);
            this.editor.dirty = false;
        }
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        window.Game.rerenderMenu();
        UI.showScreen('menu');
    },

    // ================================================
    //  СОБЫТИЯ КАРТЫ — каждый раз новые
    // ================================================

    _bindMapEvents() {
        const self = this;
        const cursorEl = document.getElementById('tools-cursor-coords');

        this.map.on('click', (e) => self._onMapClick(e));
        this.map.on('mousemove', (e) => self._onMouseMove(e));
        this.map.on('mouseout', () => { cursorEl.textContent = '—'; });
    },

    // ================================================
    //  СОБЫТИЯ UI — один раз
    // ================================================

    _bindUiEventsOnce() {
        if (this._uiBound) return;
        this._uiBound = true;
        const self = this;

        document.getElementById('btn-tools-back').addEventListener('click', () => self.close());

        document.querySelectorAll('.tools-tab').forEach(tab => {
            tab.addEventListener('click', () => self._switchTab(tab.dataset.tab));
        });

        // Калибровка
        document.getElementById('btn-cal-clear').addEventListener('click', () => self._calClear());
        document.getElementById('btn-cal-apply').addEventListener('click', () => self._calApplyD());

        const slider = document.getElementById('cal-d-slider');
        const input = document.getElementById('cal-d-input');

        slider.addEventListener('input', () => {
            input.value = slider.value;
            self.cal.currentD = parseInt(slider.value, 10);
            self._calOnDChanged();
        });

        input.addEventListener('input', () => {
            let val = parseInt(input.value, 10);
            if (isNaN(val) || val < 100) val = 100;
            if (val > 10000) val = 10000;
            slider.value = Math.min(Math.max(val, 200), 5000);
            self.cal.currentD = val;
            self._calOnDChanged();
        });

        // Редактор
        document.getElementById('btn-editor-add-series').addEventListener('click', () => self._editorAddSeries());
        document.getElementById('btn-editor-add-round').addEventListener('click', () => self._editorAddRound());
        document.getElementById('btn-editor-save-round').addEventListener('click', () => self._editorSaveRound());
        document.getElementById('btn-editor-cancel-round').addEventListener('click', () => self._editorCancelRound());
        document.getElementById('btn-editor-save-all').addEventListener('click', () => self._editorSaveAll());
        document.getElementById('editor-upload-file').addEventListener('change', (e) => self._editorOnFileUpload(e));

        // Live-sync form fields → model
        document.getElementById('editor-round-image').addEventListener('input', () => self._editorCommitRoundForm());
        document.getElementById('editor-round-x').addEventListener('input', () => self._editorCommitRoundForm());
        document.getElementById('editor-round-y').addEventListener('input', () => self._editorCommitRoundForm());
    },

    // ================================================
    //  ВКЛАДКИ
    // ================================================

    _switchTab(tabId) {
        this._editorCommitRoundForm();

        this.activeTab = tabId;

        document.querySelectorAll('.tools-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tools-tab-content').forEach(c => c.classList.remove('active'));

        document.querySelector(`.tools-tab[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');

        if (tabId !== 'tab-calibration') {
            this._calClearMarkers();
        }
    },

    // ================================================
    //  ОБЩЕЕ: КАРТА
    // ================================================

    _onMouseMove(e) {
        const px = GameMap.latLngToPx(e.latlng);
        const x = Math.round(px.x);
        const y = Math.round(px.y);
        const game = Scoring.pxToGame(x, y);
        document.getElementById('tools-cursor-coords').textContent =
            `px: ${x}, ${y}  |  game: ${game.x.toFixed(0)}, ${game.y.toFixed(0)}`;
    },

    _onMapClick(e) {
        if (this.activeTab === 'tab-calibration') {
            this._calOnMapClick(e);
        } else {
            this._editorOnMapClick(e);
        }
    },

    // ================================================
    //  КАЛИБРОВКА
    // ================================================

    _calOnMapClick(e) {
        const px = GameMap.latLngToPx(e.latlng);
        const x = Math.round(px.x);
        const y = Math.round(px.y);
        const game = Scoring.pxToGame(x, y);
        const c = this.cal;

        const popup = `px(${x}, ${y}) game(${game.x.toFixed(0)}, ${game.y.toFixed(0)})`;

        if (c.clickCount === 0) {
            this._calClearMarkers();
            c.pointA = { x, y };
            c.markerA = GameMap.createGuessMarker(e.latlng)
                .bindPopup('A: ' + UI.escHtml(popup))
                .addTo(this.map);

            document.getElementById('cal-point-a').innerHTML =
                `(${x}, ${y}) <span class="cal-game-coord">game: ${game.x.toFixed(0)}, ${game.y.toFixed(0)}</span>`;
            document.getElementById('cal-point-b').textContent = 'Кликните ещё раз';
            document.getElementById('cal-results').style.display = 'none';
            c.clickCount = 1;
        } else if (c.clickCount === 1) {
            c.pointB = { x, y };
            c.markerB = GameMap.createCorrectMarker(e.latlng)
                .bindPopup('B: ' + UI.escHtml(popup))
                .addTo(this.map);

            document.getElementById('cal-point-b').innerHTML =
                `(${x}, ${y}) <span class="cal-game-coord">game: ${game.x.toFixed(0)}, ${game.y.toFixed(0)}</span>`;

            const latLngA = GameMap.pxToLatLng(c.pointA.x, c.pointA.y);
            c.line = GameMap.createResultLine(latLngA, e.latlng).addTo(this.map);

            this._calUpdateResults();
            c.clickCount = 2;
        } else {
            c.clickCount = 0;
            this._calOnMapClick(e);
        }
    },

    _calUpdateResults() {
        const c = this.cal;
        if (!c.pointA || !c.pointB) return;

        const pxDist = Scoring.distance(c.pointA.x, c.pointA.y, c.pointB.x, c.pointB.y);
        const meters = Scoring.pxDistanceToMeters(pxDist);
        const d = Math.max(1, c.currentD);
        const score = Math.round(
            Math.max(0, Math.min(CONFIG.MAX_ROUND_SCORE,
                CONFIG.MAX_ROUND_SCORE * Math.exp(-pxDist / d)))
        );

        document.getElementById('cal-distance').innerHTML =
            `${Math.round(pxDist)} <span class="cal-game-coord">(${Scoring.formatDistance(meters)})</span>`;
        document.getElementById('cal-score').textContent = score;
        document.getElementById('cal-results').style.display = 'block';
    },

    _calOnDChanged() {
        document.getElementById('cal-d-label').textContent = this.cal.currentD;
        this._calUpdateResults();
        this._calUpdateScoreTable();
    },

    _calUpdateSlider() {
        const d = this.cal.currentD;
        document.getElementById('cal-d-slider').value = Math.min(Math.max(d, 200), 5000);
        document.getElementById('cal-d-input').value = d;
        document.getElementById('cal-d-label').textContent = d;
    },

    _calUpdateScoreTable() {
        const distances = [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000];
        const d = Math.max(1, this.cal.currentD);
        const container = document.getElementById('cal-score-table');

        const frag = document.createDocumentFragment();

        const header = document.createElement('div');
        header.className = 'cal-table-header';
        header.innerHTML = '<span>Расст. px</span><span>≈ метры</span><span>Очки</span>';
        frag.appendChild(header);

        distances.forEach(dist => {
            const score = Math.round(CONFIG.MAX_ROUND_SCORE * Math.exp(-dist / d));
            const meters = Scoring.pxDistanceToMeters(dist);

            const row = document.createElement('div');
            row.className = 'cal-table-row';
            row.innerHTML =
                `<span>${dist.toLocaleString()}</span>` +
                `<span class="cal-table-meters">${UI.escHtml(Scoring.formatDistance(meters))}</span>` +
                `<span class="cal-table-score">${score.toLocaleString()}</span>`;
            frag.appendChild(row);
        });

        container.innerHTML = '';
        container.appendChild(frag);
    },

    _calApplyD() {
        CONFIG.CALIBRATION_D = this.cal.currentD;
        const btn = document.getElementById('btn-cal-apply');
        const old = btn.textContent;
        btn.textContent = `✓ D = ${this.cal.currentD}`;
        setTimeout(() => { btn.textContent = old; }, 2000);
    },

    _calClear() {
        this._calClearMarkers();
        this.cal.pointA = null;
        this.cal.pointB = null;
        this.cal.clickCount = 0;
        document.getElementById('cal-point-a').textContent = 'Кликните на карту';
        document.getElementById('cal-point-b').textContent = 'Кликните ещё раз';
        document.getElementById('cal-results').style.display = 'none';
    },

    _calClearMarkers() {
        const c = this.cal;
        if (c.markerA && this.map) { this.map.removeLayer(c.markerA); c.markerA = null; }
        if (c.markerB && this.map) { this.map.removeLayer(c.markerB); c.markerB = null; }
        if (c.line && this.map) { this.map.removeLayer(c.line); c.line = null; }
    },

    // ================================================
    //  РЕДАКТОР: СЕРИИ
    // ================================================

    _editorRenderSeries() {
        const list = document.getElementById('editor-series-list');
        const data = this.editor.data;
        const frag = document.createDocumentFragment();

        data.series.forEach((s, i) => {
            const isSelected = i === this.editor.selectedSeries;

            const item = document.createElement('div');
            item.className = 'editor-series-item' + (isSelected ? ' selected' : '');
            item.dataset.index = i;

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'editor-series-name-input';
            nameInput.value = s.name;
            nameInput.dataset.index = i;

            const count = document.createElement('span');
            count.className = 'editor-series-count';
            count.textContent = `${s.rounds.length} р.`;

            const del = document.createElement('button');
            del.className = 'editor-series-del';
            del.dataset.index = i;
            del.title = 'Удалить серию';
            del.textContent = '✕';

            item.append(nameInput, count, del);
            frag.appendChild(item);
        });

        list.innerHTML = '';
        list.appendChild(frag);

        list.querySelectorAll('.editor-series-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('editor-series-del') ||
                    e.target.classList.contains('editor-series-name-input')) return;
                this._editorSelectSeries(parseInt(item.dataset.index, 10));
            });
        });

        list.querySelectorAll('.editor-series-name-input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                this.editor.data.series[idx].name = e.target.value;
                this._editorMarkDirty();
            });
        });

        list.querySelectorAll('.editor-series-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index, 10);
                const seriesList = this.editor.data.series;
                if (confirm(`Удалить серию "${seriesList[idx].name}"?`)) {
                    seriesList.splice(idx, 1);
                    if (this.editor.selectedSeries >= seriesList.length) {
                        this.editor.selectedSeries = -1;
                    } else if (this.editor.selectedSeries > idx) {
                        this.editor.selectedSeries--;
                    }
                    this._editorMarkDirty();
                    this._editorCancelRound();
                    this._editorRenderSeries();
                    this._editorRenderRounds();
                }
            });
        });
    },

    _editorSelectSeries(index) {
        this._editorCommitRoundForm();
        this.editor.selectedSeries = index;
        this.editor.selectedRound = -1;
        document.getElementById('editor-round-edit').style.display = 'none';
        this._editorRenderSeries();
        this._editorRenderRounds();
    },

    _editorAddSeries() {
        const newId = this.editor.data.series.length > 0
            ? Math.max(...this.editor.data.series.map(s => s.id)) + 1
            : 1;

        this.editor.data.series.push({
            id: newId,
            name: `Новая серия ${newId}`,
            rounds: []
        });

        this.editor.selectedSeries = this.editor.data.series.length - 1;
        this._editorMarkDirty();
        this._editorRenderSeries();
        this._editorRenderRounds();
    },

    // ================================================
    //  РЕДАКТОР: РАУНДЫ
    // ================================================

    _editorRenderRounds() {
        const section = document.getElementById('editor-rounds-section');
        const idx = this.editor.selectedSeries;

        if (idx < 0 || idx >= this.editor.data.series.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        const series = this.editor.data.series[idx];
        document.getElementById('editor-series-name').textContent = series.name;

        const list = document.getElementById('editor-rounds-list');
        list.innerHTML = '';

        if (series.rounds.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'editor-empty';
            empty.textContent = 'Нет раундов. Нажмите «+ Добавить раунд»';
            list.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        series.rounds.forEach((r, i) => {
            const game = Scoring.pxToGame(r.x, r.y);

            const item = document.createElement('div');
            item.className = 'editor-round-item';
            item.dataset.index = i;
            item.innerHTML =
                `<span class="editor-round-num">${i + 1}.</span>` +
                `<span class="editor-round-info">${UI.escHtml(r.image)}</span>` +
                `<span class="editor-round-xy" title="game: ${game.x.toFixed(0)}, ${game.y.toFixed(0)}">(${r.x}, ${r.y})</span>` +
                `<button class="editor-round-edit-btn" data-index="${i}" title="Редактировать">✎</button>` +
                `<button class="editor-round-del" data-index="${i}" title="Удалить">✕</button>`;
            frag.appendChild(item);
        });
        list.appendChild(frag);

        list.querySelectorAll('.editor-round-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._editorEditRound(parseInt(btn.dataset.index, 10));
            });
        });

        list.querySelectorAll('.editor-round-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const ri = parseInt(btn.dataset.index, 10);
                const s = this.editor.data.series[this.editor.selectedSeries];
                if (!confirm(`Удалить раунд ${ri+1} (${s.rounds[ri].image})?`)) return;
                s.rounds.splice(ri, 1);
                this._editorMarkDirty();
                if (this.editor.selectedRound === ri) {
                    this._editorCancelRound();
                } else if (this.editor.selectedRound > ri) {
                    this.editor.selectedRound--;
                }
                this._editorRenderRounds();
            });
        });
    },

    _editorAddRound() {
        const idx = this.editor.selectedSeries;
        if (idx < 0) return;

        const series = this.editor.data.series[idx];
        const sNum = String(series.id).padStart(2, '0');
        const rNum = String(series.rounds.length + 1).padStart(2, '0');

        series.rounds.push({
            image: `location_s${sNum}_i${rNum}.png`,
            x: 9000,
            y: 7500
        });

        this._editorMarkDirty();
        this._editorRenderRounds();
        this._editorEditRound(series.rounds.length - 1);
    },

    _editorMarkDirty() {
        this.editor.dirty = true;
    },

    _editorCommitRoundForm() {
        const idx = this.editor.selectedSeries;
        const ri = this.editor.selectedRound;
        if (idx < 0 || ri < 0) return;
        const round = this.editor.data.series[idx].rounds[ri];
        const prev = { image: round.image, x: round.x, y: round.y };
        round.image = document.getElementById('editor-round-image').value;
        round.x = parseInt(document.getElementById('editor-round-x').value, 10) || 0;
        round.y = parseInt(document.getElementById('editor-round-y').value, 10) || 0;
        if (prev.image !== round.image || prev.x !== round.x || prev.y !== round.y) {
            this._editorMarkDirty();
        }
    },

    _editorEditRound(roundIndex) {
        const idx = this.editor.selectedSeries;
        if (idx < 0) return;

        this.editor.selectedRound = roundIndex;

        const round = this.editor.data.series[idx].rounds[roundIndex];

        document.getElementById('editor-round-edit').style.display = 'block';
        document.getElementById('editor-round-image').value = round.image;
        document.getElementById('editor-round-x').value = round.x;
        document.getElementById('editor-round-y').value = round.y;

        this._editorUpdatePreview(round.image);
        this._editorPlaceMarker(round.x, round.y);
    },

    _editorSaveRound() {
        const idx = this.editor.selectedSeries;
        const ri = this.editor.selectedRound;
        if (idx < 0 || ri < 0) return;

        this._editorCommitRoundForm();

        document.getElementById('editor-round-edit').style.display = 'none';
        this.editor.selectedRound = -1;

        if (this.editor.editMarker) {
            this.map.removeLayer(this.editor.editMarker);
            this.editor.editMarker = null;
        }

        this._editorRenderRounds();
    },

    _editorCancelRound() {
        document.getElementById('editor-round-edit').style.display = 'none';
        this.editor.selectedRound = -1;

        if (this.editor.editMarker) {
            this.map.removeLayer(this.editor.editMarker);
            this.editor.editMarker = null;
        }
    },

    _editorOnMapClick(e) {
        if (this.editor.selectedRound < 0) return;

        const px = GameMap.latLngToPx(e.latlng);
        const x = Math.round(px.x);
        const y = Math.round(px.y);

        document.getElementById('editor-round-x').value = x;
        document.getElementById('editor-round-y').value = y;

        this._editorPlaceMarker(x, y);
    },

    _editorPlaceMarker(x, y) {
        if (this.editor.editMarker && this.map) {
            this.map.removeLayer(this.editor.editMarker);
        }

        const latlng = GameMap.pxToLatLng(x, y);
        const game = Scoring.pxToGame(x, y);
        const popup = `px(${x}, ${y})<br>game(${game.x.toFixed(0)}, ${game.y.toFixed(0)})`;
        this.editor.editMarker = GameMap.createCorrectMarker(latlng)
            .bindPopup(popup)
            .addTo(this.map);
    },

    _editorUpdatePreview(filename) {
        const container = document.getElementById('editor-image-preview');
        container.innerHTML = '';
        if (!filename) return;

        const img = document.createElement('img');
        img.alt = 'Превью';
        img.src = `${CONFIG.LOCS_PATH}/${filename}?v=${Date.now()}`;
        img.onerror = () => {
            container.innerHTML = '<span class="editor-no-image">Изображение не найдено</span>';
        };
        container.appendChild(img);
    },

    // ================================================
    //  РЕДАКТОР: ЗАГРУЗКА ФАЙЛА
    // ================================================

    async _editorOnFileUpload(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;

        if (file.size > 18 * 1024 * 1024) {
            this._editorShowStatus('✕ Файл больше 18 МБ', 'error');
            return;
        }

        const filename = document.getElementById('editor-round-image').value || file.name;

        if (Api.isServer) {
            const uploadBtn = document.getElementById('editor-upload-file');
            uploadBtn.disabled = true;
            this._editorShowStatus('⏳ Загрузка...', 'warning');
            try {
                const data = await Api.uploadLocation(file, filename);
                if (data.status === 'ok') {
                    document.getElementById('editor-round-image').value = data.filename;
                    this._editorUpdatePreview(data.filename);
                    this._editorCommitRoundForm();
                    this._editorShowStatus('✓ Изображение загружено', 'success');
                }
            } catch (err) {
                this._editorShowStatus('✕ Ошибка загрузки: ' + err.message, 'error');
            } finally {
                uploadBtn.disabled = false;
            }
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const container = document.getElementById('editor-image-preview');
                container.innerHTML = '';
                const img = document.createElement('img');
                img.alt = 'Превью';
                img.src = ev.target.result;
                container.appendChild(img);
            };
            reader.readAsDataURL(file);
            this._editorShowStatus(`⚠ Файл нужно вручную скопировать в locs/${filename}`, 'warning');
        }
    },

    // ================================================
    //  РЕДАКТОР: СОХРАНЕНИЕ
    // ================================================

    async _editorSaveAll() {
        this._editorCommitRoundForm();

        const data = this.editor.data;

        if (!Api.isServer) {
            const json = JSON.stringify(data, null, 4);
            const blob = new Blob([`const LOCATIONS_DATA = ${json};\n`], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'locations_data.js';
            a.click();
            URL.revokeObjectURL(url);

            LOCATIONS_DATA.series = structuredClone(data.series);
            this.editor.data = structuredClone(LOCATIONS_DATA);
            this.editor.dirty = false;
            window.Game.rerenderMenu();
            this._editorRenderSeries();
            this._editorRenderRounds();

            this._editorShowStatus('✓ Применено в памяти. Файл скачан — замените locations_data.js', 'warning');
            return;
        }

        try {
            const result = await Api.saveSeries(data);
            LOCATIONS_DATA.series = structuredClone(data.series);
            this.editor.data = structuredClone(LOCATIONS_DATA);
            this.editor.dirty = false;
            window.Game.rerenderMenu();
            this._editorRenderSeries();
            this._editorRenderRounds();
            this._editorShowStatus(`✓ Сохранено! Бэкап: ${result.backup}`, 'success');
        } catch (err) {
            this._editorShowStatus('✕ Ошибка: ' + err.message, 'error');
        }
    },

    _editorShowStatus(message, type) {
        const el = document.getElementById('editor-status');
        el.textContent = message;
        el.className = 'editor-status editor-status-' + type;
        clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(() => {
            el.textContent = '';
            el.className = 'editor-status';
        }, 5000);
    }
};