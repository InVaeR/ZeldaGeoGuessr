/* ==========================================================
   tools.js — Инструменты: калибровка + редактор серий
   ========================================================== */

const Tools = {

    map: null,
    activeTab: 'tab-calibration',
    eventsInitialized: false,

    // === Калибровка ===
    cal: {
        pointA: null,
        pointB: null,
        markerA: null,
        markerB: null,
        line: null,
        clickCount: 0,
        currentD: 2000
    },

    // === Редактор ===
    editor: {
        data: null,           // копия LOCATIONS_DATA
        selectedSeries: -1,
        selectedRound: -1,
        editMarker: null,
        mode: 'calibration'   // 'calibration' | 'editor-pick'
    },

    // ================================================
    //  ОТКРЫТИЕ / ЗАКРЫТИЕ
    // ================================================

    open() {
        this.cal.currentD = CONFIG.CALIBRATION_D;
        this.editor.data = JSON.parse(JSON.stringify(LOCATIONS_DATA));
        this.editor.mode = 'calibration';

        UI.showScreen('tools');

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        setTimeout(() => {
            this.map = GameMap.create('tools-map');
            this._initEvents();
            this._calUpdateSlider();
            this._calUpdateScoreTable();
            this._calClear();
            this._editorRenderSeries();
            this._switchTab('tab-calibration');
        }, 100);
    },

    close() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.eventsInitialized = false;
        UI.showScreen('menu');
    },

    // ================================================
    //  ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ
    // ================================================

    _initEvents() {
        if (this.eventsInitialized) {
            // Только перепривязываем карту
            this.map.on('click', (e) => this._onMapClick(e));
            this.map.on('mousemove', (e) => this._onMouseMove(e));
            return;
        }

        const self = this;

        // Карта
        this.map.on('click', (e) => self._onMapClick(e));
        this.map.on('mousemove', (e) => self._onMouseMove(e));

        // Назад
        document.getElementById('btn-tools-back').addEventListener('click', () => self.close());

        // Вкладки
        document.querySelectorAll('.tools-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                self._switchTab(tab.dataset.tab);
            });
        });

        // === Калибровка ===
        document.getElementById('btn-cal-clear').addEventListener('click', () => self._calClear());
        document.getElementById('btn-cal-apply').addEventListener('click', () => self._calApplyD());

        const slider = document.getElementById('cal-d-slider');
        const input = document.getElementById('cal-d-input');

        slider.addEventListener('input', () => {
            input.value = slider.value;
            self.cal.currentD = parseInt(slider.value);
            self._calOnDChanged();
        });

        input.addEventListener('input', () => {
            let val = parseInt(input.value);
            if (isNaN(val) || val < 100) val = 100;
            if (val > 10000) val = 10000;
            slider.value = Math.min(Math.max(val, 200), 5000);
            self.cal.currentD = val;
            self._calOnDChanged();
        });

        // === Редактор ===
        document.getElementById('btn-editor-add-series').addEventListener('click', () => self._editorAddSeries());
        document.getElementById('btn-editor-add-round').addEventListener('click', () => self._editorAddRound());
        document.getElementById('btn-editor-save-round').addEventListener('click', () => self._editorSaveRound());
        document.getElementById('btn-editor-cancel-round').addEventListener('click', () => self._editorCancelRound());
        document.getElementById('btn-editor-save-all').addEventListener('click', () => self._editorSaveAll());

        document.getElementById('editor-upload-file').addEventListener('change', (e) => self._editorOnFileUpload(e));

        this.eventsInitialized = true;
    },

    // ================================================
    //  ВКЛАДКИ
    // ================================================

    _switchTab(tabId) {
        this.activeTab = tabId;

        document.querySelectorAll('.tools-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tools-tab-content').forEach(c => c.classList.remove('active'));

        document.querySelector(`.tools-tab[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');

        // Сбрасываем режим
        if (tabId === 'tab-calibration') {
            this.editor.mode = 'calibration';
        } else {
            this.editor.mode = 'editor-pick';
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
        document.getElementById('tools-cursor-coords').textContent = `X: ${x}, Y: ${y}`;
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
        const c = this.cal;

        if (c.clickCount === 0) {
            this._calClearMarkers();
            c.pointA = { x, y };
            c.markerA = GameMap.createGuessMarker(e.latlng).bindPopup(`A: (${x}, ${y})`).addTo(this.map);
            document.getElementById('cal-point-a').textContent = `(${x}, ${y})`;
            document.getElementById('cal-point-b').textContent = 'Кликните ещё раз';
            document.getElementById('cal-results').style.display = 'none';
            c.clickCount = 1;
        } else if (c.clickCount === 1) {
            c.pointB = { x, y };
            c.markerB = GameMap.createCorrectMarker(e.latlng).bindPopup(`B: (${x}, ${y})`).addTo(this.map);
            document.getElementById('cal-point-b').textContent = `(${x}, ${y})`;

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

        const dist = Scoring.distance(c.pointA.x, c.pointA.y, c.pointB.x, c.pointB.y);
        const score = Math.round(CONFIG.MAX_ROUND_SCORE * Math.exp(-dist / c.currentD));

        document.getElementById('cal-distance').textContent = Math.round(dist);
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
        const d = this.cal.currentD;
        let html = '<div class="cal-table-header"><span>Расст.</span><span>Очки</span><span></span></div>';

        distances.forEach(dist => {
            const score = Math.round(CONFIG.MAX_ROUND_SCORE * Math.exp(-dist / d));
            const pct = (score / CONFIG.MAX_ROUND_SCORE * 100).toFixed(1);
            html += `<div class="cal-table-row">
                <span>${dist.toLocaleString()}</span>
                <span class="cal-table-score">${score.toLocaleString()}</span>
                <span class="cal-table-pct">${pct}%</span>
            </div>`;
        });

        document.getElementById('cal-score-table').innerHTML = html;
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
        let html = '';

        data.series.forEach((s, i) => {
            const isSelected = i === this.editor.selectedSeries;
            html += `<div class="editor-series-item ${isSelected ? 'selected' : ''}" data-index="${i}">
                <input type="text" class="editor-series-name-input" value="${this._escHtml(s.name)}" data-index="${i}" />
                <span class="editor-series-count">${s.rounds.length} р.</span>
                <button class="editor-series-del" data-index="${i}" title="Удалить серию">✕</button>
            </div>`;
        });

        list.innerHTML = html;

        // Клик по серии — выбрать
        list.querySelectorAll('.editor-series-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('editor-series-del') ||
                    e.target.classList.contains('editor-series-name-input')) return;
                this._editorSelectSeries(parseInt(item.dataset.index));
            });
        });

        // Изменение имени
        list.querySelectorAll('.editor-series-name-input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.editor.data.series[idx].name = e.target.value;
            });
        });

        // Удаление серии
        list.querySelectorAll('.editor-series-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                if (confirm(`Удалить серию "${data.series[idx].name}"?`)) {
                    data.series.splice(idx, 1);
                    if (this.editor.selectedSeries >= data.series.length) {
                        this.editor.selectedSeries = -1;
                    }
                    this._editorRenderSeries();
                    this._editorRenderRounds();
                }
            });
        });
    },

    _editorSelectSeries(index) {
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
        let html = '';

        series.rounds.forEach((r, i) => {
            html += `<div class="editor-round-item" data-index="${i}">
                <span class="editor-round-num">${i + 1}.</span>
                <span class="editor-round-info">${this._escHtml(r.image)}</span>
                <span class="editor-round-xy">(${r.x}, ${r.y})</span>
                <button class="editor-round-edit-btn" data-index="${i}" title="Редактировать">✎</button>
                <button class="editor-round-del" data-index="${i}" title="Удалить">✕</button>
            </div>`;
        });

        if (series.rounds.length === 0) {
            html = '<div class="editor-empty">Нет раундов. Нажмите «+ Добавить раунд»</div>';
        }

        list.innerHTML = html;

        // Редактировать раунд
        list.querySelectorAll('.editor-round-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._editorEditRound(parseInt(btn.dataset.index));
            });
        });

        // Удалить раунд
        list.querySelectorAll('.editor-round-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const ri = parseInt(btn.dataset.index);
                series.rounds.splice(ri, 1);
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

        this._editorRenderRounds();
        this._editorEditRound(series.rounds.length - 1);
    },

    _editorEditRound(roundIndex) {
        const idx = this.editor.selectedSeries;
        if (idx < 0) return;

        this.editor.selectedRound = roundIndex;
        this.editor.mode = 'editor-pick';

        const round = this.editor.data.series[idx].rounds[roundIndex];

        document.getElementById('editor-round-edit').style.display = 'block';
        document.getElementById('editor-round-image').value = round.image;
        document.getElementById('editor-round-x').value = round.x;
        document.getElementById('editor-round-y').value = round.y;

        // Превью
        this._editorUpdatePreview(round.image);

        // Маркер на карте
        this._editorPlaceMarker(round.x, round.y);
    },

    _editorSaveRound() {
        const idx = this.editor.selectedSeries;
        const ri = this.editor.selectedRound;
        if (idx < 0 || ri < 0) return;

        const round = this.editor.data.series[idx].rounds[ri];
        round.image = document.getElementById('editor-round-image').value;
        round.x = parseInt(document.getElementById('editor-round-x').value) || 0;
        round.y = parseInt(document.getElementById('editor-round-y').value) || 0;

        document.getElementById('editor-round-edit').style.display = 'none';
        this.editor.selectedRound = -1;
        this.editor.mode = 'calibration';

        if (this.editor.editMarker) {
            this.map.removeLayer(this.editor.editMarker);
            this.editor.editMarker = null;
        }

        this._editorRenderRounds();
    },

        _editorCancelRound() {
        document.getElementById('editor-round-edit').style.display = 'none';
        this.editor.selectedRound = -1;
        this.editor.mode = 'calibration';

        if (this.editor.editMarker) {
            this.map.removeLayer(this.editor.editMarker);
            this.editor.editMarker = null;
        }
    },

    // ================================================
    //  РЕДАКТОР: КЛИК ПО КАРТЕ (выбор координат)
    // ================================================

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
        this.editor.editMarker = GameMap.createCorrectMarker(latlng)
            .bindPopup(`(${x}, ${y})`)
            .addTo(this.map);
    },

    _editorUpdatePreview(filename) {
        const container = document.getElementById('editor-image-preview');
        if (!filename) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `<img src="${CONFIG.LOCS_PATH}/${this._escHtml(filename)}" 
            alt="Превью" onerror="this.parentElement.innerHTML='<span class=\\'editor-no-image\\'>Изображение не найдено</span>'" />`;
    },

    // ================================================
    //  РЕДАКТОР: ЗАГРУЗКА ФАЙЛА
    // ================================================

    _editorOnFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const filename = document.getElementById('editor-round-image').value || file.name;

        // Если есть сервер — загружаем через API
        if (window.location.protocol !== 'file:') {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('filename', filename);

            fetch('/api/upload-location', {
                method: 'POST',
                body: formData
            })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'ok') {
                    document.getElementById('editor-round-image').value = data.filename;
                    this._editorUpdatePreview(data.filename);
                    this._editorShowStatus('✓ Изображение загружено', 'success');
                }
            })
            .catch(err => {
                this._editorShowStatus('✕ Ошибка загрузки: ' + err.message, 'error');
            });
        } else {
            // Без сервера — просто показываем превью
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('editor-image-preview').innerHTML =
                    `<img src="${ev.target.result}" alt="Превью" />`;
            };
            reader.readAsDataURL(file);
            this._editorShowStatus('⚠ Файл нужно вручную скопировать в locs/', 'warning');
        }

        // Сбрасываем input чтобы можно было загрузить тот же файл повторно
        e.target.value = '';
    },

    // ================================================
    //  РЕДАКТОР: СОХРАНЕНИЕ НА ДИСК
    // ================================================

    _editorSaveAll() {
        const data = this.editor.data;

        if (window.location.protocol === 'file:') {
            // Без сервера — показываем JSON для ручного копирования
            const json = JSON.stringify(data, null, 4);
            const blob = new Blob([`const LOCATIONS_DATA = ${json};\n`], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'locations_data.js';
            a.click();
            URL.revokeObjectURL(url);
            this._editorShowStatus('✓ Файл скачан. Замените locations_data.js вручную.', 'warning');
            return;
        }

        // Через сервер
        fetch('/api/series/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(result => {
            // Обновляем глобальные данные
            Object.assign(LOCATIONS_DATA, JSON.parse(JSON.stringify(data)));
            this._editorShowStatus(`✓ Сохранено! Бэкап: ${result.backup}`, 'success');
        })
        .catch(err => {
            this._editorShowStatus('✕ Ошибка сохранения: ' + err.message, 'error');
        });
    },

    _editorShowStatus(message, type) {
        const el = document.getElementById('editor-status');
        el.textContent = message;
        el.className = 'editor-status editor-status-' + type;
        setTimeout(() => {
            el.textContent = '';
            el.className = 'editor-status';
        }, 5000);
    },

    // ================================================
    //  УТИЛИТЫ
    // ================================================

    _escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};