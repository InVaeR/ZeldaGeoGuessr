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
    },

    async deleteLocationImage(filename) {
        const r = await fetch('/api/delete-location-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        if (!r.ok) {
            const text = await r.text().catch(() => '');
            throw new Error(`HTTP ${r.status}: ${text || 'Ошибка удаления'}`);
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
        dirty: false,
        _roundSnapshot: null,
        _uidCounter: 0
    },

    // ================================================
    //  ОТКРЫТИЕ / ЗАКРЫТИЕ
    // ================================================

    open() {
        this.cal.currentD = CONFIG.CALIBRATION_D;
        this.editor.data = structuredClone(LOCATIONS_DATA);
        this.editor.dirty = false;
        this._assignUids();

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
        this._editorCommitRoundForm();
        if (this.editor.dirty) {
            if (!confirm('Есть несохранённые изменения. Применить в память? (на диск НЕ записано)')) {
                this.editor.data = structuredClone(LOCATIONS_DATA);
                this._assignUids();
                this.editor.dirty = false;
                this._editorRenderSeries();
                this._editorRenderRounds();
            } else {
                LOCATIONS_DATA.series = structuredClone(this.editor.data.series);
                this.editor.data = structuredClone(LOCATIONS_DATA);
                this._assignUids();
                this.editor.dirty = false;
            }
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

        // Event delegation for editor series list
        document.getElementById('editor-series-list').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.editor-series-edit-btn');
            const delBtn = e.target.closest('.editor-series-del');
            const item = e.target.closest('.editor-series-item');
            if (editBtn && item) {
                const span = item.querySelector('.editor-series-name');
                if (span && !span.classList.contains('editing')) {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'editor-series-name-input';
                    input.value = span.textContent;
                    input.dataset.index = span.dataset.index;
                    span.classList.add('editing');
                    span.replaceWith(input);
                    input.focus();
                    input.select();
                }
                return;
            }
            if (delBtn && item) {
                const idx = parseInt(item.dataset.index, 10);
                const seriesList = self.editor.data.series;
                if (confirm(`Удалить серию "${seriesList[idx].name}"?`)) {
                    seriesList.splice(idx, 1);
                    if (self.editor.selectedSeries >= seriesList.length) {
                        self.editor.selectedSeries = -1;
                    } else if (self.editor.selectedSeries > idx) {
                        self.editor.selectedSeries--;
                    }
                    self._editorMarkDirty();
                    self._editorCancelRound();
                    self._editorRenderSeries();
                    self._editorRenderRounds();
                }
            } else if (item) {
                self._editorSelectSeries(parseInt(item.dataset.index, 10));
            }
        });
        document.getElementById('editor-series-list').addEventListener('focusout', (e) => {
            const inp = e.target.closest('.editor-series-name-input');
            if (inp) {
                self._editorFinalizeSeriesName(inp);
            }
        });
        document.getElementById('editor-series-list').addEventListener('keydown', (e) => {
            const inp = e.target.closest('.editor-series-name-input');
            if (inp && e.key === 'Enter') {
                inp.blur();
            }
        });

        // Event delegation for editor rounds list
        document.getElementById('editor-rounds-list').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.editor-round-edit-btn');
            const delBtn = e.target.closest('.editor-round-del');
            if (editBtn) {
                self._editorEditRound(parseInt(editBtn.dataset.index, 10));
            } else if (delBtn) {
                const ri = parseInt(delBtn.dataset.index, 10);
                const s = self.editor.data.series[self.editor.selectedSeries];
                const round = s.rounds[ri];
                if (!confirm(`Удалить раунд ${ri+1} (${round.image})?`)) return;
                if (Api.isServer && round.image && confirm('Также удалить файл изображения с диска?')) {
                    Api.deleteLocationImage(round.image).catch(() => {});
                }
                s.rounds.splice(ri, 1);
                self._editorMarkDirty();
                if (self.editor.selectedRound === ri) {
                    self._editorCancelRound();
                } else if (self.editor.selectedRound > ri) {
                    self.editor.selectedRound--;
                }
                self._editorRenderRounds();
            }
        });
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

            const nameSpan = document.createElement('span');
            nameSpan.className = 'editor-series-name';
            nameSpan.textContent = s.name;
            nameSpan.dataset.index = i;

            const count = document.createElement('span');
            count.className = 'editor-series-count';
            count.textContent = `${s.rounds.length} р.`;

            const editBtn = document.createElement('button');
            editBtn.className = 'editor-series-edit-btn';
            editBtn.dataset.index = i;
            editBtn.title = 'Редактировать название';
            editBtn.textContent = '✎';

            const del = document.createElement('button');
            del.className = 'editor-series-del';
            del.dataset.index = i;
            del.title = 'Удалить серию';
            del.textContent = '✕';

            item.append(nameSpan, count, editBtn, del);
            frag.appendChild(item);
        });

        list.innerHTML = '';
        list.appendChild(frag);
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
    },

    _editorAddRound() {
        const idx = this.editor.selectedSeries;
        if (idx < 0) return;

        const series = this.editor.data.series[idx];
        const sNum = String(series.id).padStart(2, '0');

        const used = new Set(series.rounds.map(r => r.image));
        let rNum = 1;
        while (used.has(`location_s${sNum}_i${String(rNum).padStart(2, '0')}.png`)) {
            rNum++;
        }

        const newRound = {
            image: `location_s${sNum}_i${String(rNum).padStart(2, '0')}.png`,
            x: 9000,
            y: 7500
        };
        newRound._uid = ++this.editor._uidCounter;
        series.rounds.push(newRound);

        this._editorMarkDirty();
        this._editorRenderRounds();
        this._editorEditRound(series.rounds.length - 1);
    },

    _editorMarkDirty() {
        this.editor.dirty = true;
    },

    _editorFinalizeSeriesName(input) {
        const idx = parseInt(input.dataset.index, 10);
        const name = input.value.trim() || 'Безымянная';
        this.editor.data.series[idx].name = name;
        this._editorMarkDirty();
        const span = document.createElement('span');
        span.className = 'editor-series-name';
        span.textContent = name;
        span.dataset.index = idx;
        input.replaceWith(span);
    },

    _assignUids() {
        this.editor._uidCounter = 0;
        this.editor.data.series.forEach(s => {
            s.rounds.forEach(r => {
                r._uid = ++this.editor._uidCounter;
            });
        });
    },

    _stripUids(obj) {
        if (Array.isArray(obj)) {
            obj.forEach(v => this._stripUids(v));
        } else if (obj && typeof obj === 'object') {
            delete obj._uid;
            Object.values(obj).forEach(v => this._stripUids(v));
        }
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
        this.editor._roundSnapshot = structuredClone(round);

        document.getElementById('editor-round-edit').style.display = 'block';
        document.getElementById('editor-round-image').value = round.image;
        document.getElementById('editor-round-x').value = round.x;
        document.getElementById('editor-round-y').value = round.y;

        this._editorUpdatePreview(round.image);
        this._editorPlaceMarker(round.x, round.y);
    },

    _editorSaveRound() {
        this._editorDoneRound();
    },

    _editorDoneRound() {
        const idx = this.editor.selectedSeries;
        const ri = this.editor.selectedRound;
        if (idx < 0 || ri < 0) return;

        this.editor._roundSnapshot = null;
        document.getElementById('editor-round-edit').style.display = 'none';
        this.editor.selectedRound = -1;

        if (this.editor.editMarker) {
            this.map.removeLayer(this.editor.editMarker);
            this.editor.editMarker = null;
        }

        this._editorRenderRounds();
    },

    _editorCancelRound() {
        const idx = this.editor.selectedSeries;
        const ri = this.editor.selectedRound;
        if (idx >= 0 && ri >= 0 && this.editor._roundSnapshot) {
            const snap = this.editor._roundSnapshot;
            this.editor.data.series[idx].rounds[ri].image = snap.image;
            this.editor.data.series[idx].rounds[ri].x = snap.x;
            this.editor.data.series[idx].rounds[ri].y = snap.y;
        }
        this.editor._roundSnapshot = null;
        document.getElementById('editor-round-edit').style.display = 'none';
        this.editor.selectedRound = -1;

        if (this.editor.editMarker) {
            this.map.removeLayer(this.editor.editMarker);
            this.editor.editMarker = null;
        }

        this._editorRenderRounds();
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

        let filename = document.getElementById('editor-round-image').value || file.name;
        const currentVal = document.getElementById('editor-round-image').value;
        const defaultPattern = /^location_s\d+_i\d+\.png$/;
        if (currentVal && !defaultPattern.test(currentVal) && currentVal !== filename) {
            if (!confirm(`Заменить "${currentVal}" на "${filename}"?`)) return;
        }

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
        const errors = [];
        data.series.forEach((s, si) => {
            if (s.rounds.length === 0) {
                errors.push(`Серия «${s.name}» не содержит раундов`);
            }
            s.rounds.forEach((r, ri) => {
                if (!r.image) errors.push(`Раунд ${si+1}.${ri+1}: пустое имя файла`);
                if (r.x < 0 || r.x > 18000) errors.push(`Раунд ${si+1}.${ri+1}: X вне карты (0–18000)`);
                if (r.y < 0 || r.y > 15000) errors.push(`Раунд ${si+1}.${ri+1}: Y вне карты (0–15000)`);
            });
        });
        if (errors.length > 0) {
            this._editorShowStatus('⚠ ' + errors.join('; '), 'error');
            return;
        }

        const cleanData = structuredClone(data);
        this._stripUids(cleanData);

        if (!Api.isServer) {
            const json = JSON.stringify(cleanData, null, 4);
            const blob = new Blob([`const LOCATIONS_DATA = ${json};\n`], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'locations_data.js';
            a.click();
            URL.revokeObjectURL(url);

            LOCATIONS_DATA.series = structuredClone(data.series);
            this.editor.data = structuredClone(LOCATIONS_DATA);
            this._assignUids();
            this.editor.dirty = false;
            window.Game.rerenderMenu();
            this._editorRenderSeries();
            this._editorRenderRounds();

            this._editorShowStatus('✓ Применено в памяти. Файл скачан — замените locations_data.js', 'warning');
            return;
        }

        try {
            const result = await Api.saveSeries(cleanData);
            LOCATIONS_DATA.series = structuredClone(data.series);
            this.editor.data = structuredClone(LOCATIONS_DATA);
            this._assignUids();
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