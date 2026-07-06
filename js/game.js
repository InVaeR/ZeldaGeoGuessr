// ============================================================================
// game.js — Основная логика игры
// ============================================================================

(function () {
    'use strict';

    const Game = {
        currentSeries: null,
        roundIndex: 0,
        totalScore: 0,
        roundResults: [],

        gameMap: null,
        resultMap: null,
        guessMarker: null,

        async _detectServer() {
            try {
                const r = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
                if (r.ok) CONFIG.IS_SERVER = true;
            } catch (_) {}
        },

        async init() {
            UI.init();
            await this._detectServer();
            if (CONFIG.IS_SERVER) {
                try {
                    const r = await fetch('/api/series');
                    if (r.ok) {
                        const data = await r.json();
                        LOCATIONS_DATA.series = data.series || data;
                    }
                } catch (_) {}
            }
            this.rerenderMenu();

            UI.els.btnConfirm.addEventListener('click', () => this.onConfirm());
            UI.els.btnNextRound.addEventListener('click', () => this.onNextRound());
            UI.els.btnBackMenu.addEventListener('click', () => this.onBackToMenu());
            UI.els.btnToggleImage.addEventListener('click', () => UI.toggleImage());
            UI.els.locationImage.addEventListener('click', () => UI.openImageFullscreen());

            document.getElementById('btn-tools').addEventListener('click', () => Tools.open());

            UI.showScreen('menu');
        },

        startGame(seriesIndex) {
            this.currentSeries = LOCATIONS_DATA.series[seriesIndex];
            this.roundIndex = 0;
            this.totalScore = 0;
            this.roundResults = [];

            UI.updateHUD(this.currentSeries.name, 1, this.currentSeries.rounds.length, 0);
            UI.showScreen('game');

            this.gameMap = GameMap.recreate('map', this.gameMap);
            this.startRound();
        },

        startRound() {
            const round = this.currentSeries.rounds[this.roundIndex];

            UI.updateHUD(
                this.currentSeries.name,
                this.roundIndex + 1,
                this.currentSeries.rounds.length,
                this.totalScore
            );
            UI.showLocationImage(round.image);
            UI.setConfirmEnabled(false);

            if (this.guessMarker) {
                this.gameMap.removeLayer(this.guessMarker);
                this.guessMarker = null;
            }

            GameMap.resetView(this.gameMap);

            this.gameMap.off('click');
            this.gameMap.on('click', (e) => this.onMapClick(e));
        },

        onMapClick(e) {
            if (this.guessMarker) {
                this.gameMap.removeLayer(this.guessMarker);
            }
            this.guessMarker = GameMap.createGuessMarker(e.latlng).addTo(this.gameMap);
            UI.setConfirmEnabled(true);
        },

        onConfirm() {
            if (!this.guessMarker) return;

            const round = this.currentSeries.rounds[this.roundIndex];
            const guessPx = GameMap.latLngToPx(this.guessMarker.getLatLng());

            const distance = Scoring.distance(guessPx.x, guessPx.y, round.x, round.y);
            const score = Scoring.score(distance);
            const meters = Scoring.pxDistanceToMeters(distance);

            this.totalScore += score;

            this.roundResults.push({
                roundNum: this.roundIndex + 1,
                guessX: Math.round(guessPx.x),
                guessY: Math.round(guessPx.y),
                correctX: round.x,
                correctY: round.y,
                distance: Math.round(distance),
                meters,
                score
            });

            this.gameMap.off('click');
            this.showRoundResult(round, guessPx, distance, score);
        },

        showRoundResult(round, guessPx, distance, score) {
            const isLastRound = this.roundIndex >= this.currentSeries.rounds.length - 1;
            const meters = Scoring.pxDistanceToMeters(distance);
            const distText = `${Math.round(distance)} px (${Scoring.formatDistance(meters)})`;

            UI.showRoundResult(distText, score, this.totalScore, isLastRound);
            UI.showScreen('roundResult');

            this.resultMap = GameMap.recreate('result-map', this.resultMap);

            const guessLatLng = GameMap.pxToLatLng(guessPx.x, guessPx.y);
            const correctLatLng = GameMap.pxToLatLng(round.x, round.y);

            GameMap.createGuessMarker(guessLatLng).bindPopup('Ваш ответ').addTo(this.resultMap);
            GameMap.createCorrectMarker(correctLatLng).bindPopup('Правильный ответ').addTo(this.resultMap);
            GameMap.createResultLine(guessLatLng, correctLatLng).addTo(this.resultMap);

            const bounds = L.latLngBounds([guessLatLng, correctLatLng]);
            this.resultMap.fitBounds(bounds.pad(0.3));
        },

        onNextRound() {
            this.roundIndex++;

            if (this.roundIndex < this.currentSeries.rounds.length) {
                UI.showScreen('game');
                this.gameMap = GameMap.recreate('map', this.gameMap);
                this.startRound();
            } else {
                UI.showFinalResults(this.roundResults, this.totalScore);
                UI.showScreen('final');
            }
        },

        onBackToMenu() {
            if (this.gameMap) { this.gameMap.remove(); this.gameMap = null; }
            if (this.resultMap) { this.resultMap.remove(); this.resultMap = null; }

            this.rerenderMenu();
            UI.showScreen('menu');
        },

        rerenderMenu() {
            UI.renderSeriesList(LOCATIONS_DATA.series, (i) => this.startGame(i));
        }
    };

    document.addEventListener('DOMContentLoaded', () => Game.init());
    window.Game = Game;

})();