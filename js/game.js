/* ==========================================================
   game.js — Основная логика игры
   ========================================================== */

(function () {
    'use strict';

    // ========================
    //  СОСТОЯНИЕ
    // ========================

    let currentSeries = null;
    let roundIndex = 0;
    let totalScore = 0;
    let roundResults = [];

    let gameMap = null;
    let resultMap = null;
    let guessMarker = null;

    // ========================
    //  ИНИЦИАЛИЗАЦИЯ
    // ========================

    function init() {
        UI.renderSeriesList(LOCATIONS_DATA.series, startGame);

        UI.els.btnConfirm.addEventListener('click', onConfirm);
        UI.els.btnNextRound.addEventListener('click', onNextRound);
        UI.els.btnBackMenu.addEventListener('click', onBackToMenu);
        UI.els.btnToggleImage.addEventListener('click', () => UI.toggleImage());
        UI.els.locationImage.addEventListener('click', () => UI.openImageFullscreen());
        document.getElementById('btn-calibration').addEventListener('click', () => Calibration.open());

        UI.createImageOverlay();
        UI.showScreen('menu');
    }

    // ========================
    //  НАЧАЛО ИГРЫ
    // ========================

    function startGame(seriesIndex) {
        currentSeries = LOCATIONS_DATA.series[seriesIndex];
        roundIndex = 0;
        totalScore = 0;
        roundResults = [];

        UI.updateHUD(currentSeries.name, 1, currentSeries.rounds.length, 0);
        UI.showScreen('game');

        if (gameMap) {
            gameMap.remove();
            gameMap = null;
        }

        setTimeout(() => {
            gameMap = GameMap.create('map');
            startRound();
        }, 100);
    }

    // ========================
    //  РАУНД
    // ========================

    function startRound() {
        const round = currentSeries.rounds[roundIndex];

        UI.updateHUD(currentSeries.name, roundIndex + 1, currentSeries.rounds.length, totalScore);
        UI.showLocationImage(round.image);
        UI.setConfirmEnabled(false);

        if (guessMarker) {
            gameMap.removeLayer(guessMarker);
            guessMarker = null;
        }

        GameMap.resetView(gameMap);

        gameMap.off('click');
        gameMap.on('click', onMapClick);
    }

    function onMapClick(e) {
        if (guessMarker) {
            gameMap.removeLayer(guessMarker);
        }

        guessMarker = GameMap.createGuessMarker(e.latlng).addTo(gameMap);
        UI.setConfirmEnabled(true);
    }

    // ========================
    //  ПОДТВЕРЖДЕНИЕ
    // ========================

    function onConfirm() {
        if (!guessMarker) return;

        const round = currentSeries.rounds[roundIndex];
        const guessPx = GameMap.latLngToPx(guessMarker.getLatLng());

        const distance = Scoring.distance(guessPx.x, guessPx.y, round.x, round.y);
        const score = Scoring.score(distance);

        totalScore += score;

        roundResults.push({
            roundNum: roundIndex + 1,
            guessX: Math.round(guessPx.x),
            guessY: Math.round(guessPx.y),
            correctX: round.x,
            correctY: round.y,
            distance: Math.round(distance),
            score: score
        });

        gameMap.off('click');

        showRoundResult(round, guessPx, distance, score);
    }

    // ========================
    //  РЕЗУЛЬТАТ РАУНДА
    // ========================

    function showRoundResult(round, guessPx, distance, score) {
        const isLastRound = roundIndex >= currentSeries.rounds.length - 1;

        UI.showRoundResult(distance, score, totalScore, isLastRound);
        UI.showScreen('roundResult');

        if (resultMap) {
            resultMap.remove();
            resultMap = null;
        }

        setTimeout(() => {
            resultMap = GameMap.create('result-map');

            const guessLatLng = GameMap.pxToLatLng(guessPx.x, guessPx.y);
            const correctLatLng = GameMap.pxToLatLng(round.x, round.y);

            GameMap.createGuessMarker(guessLatLng)
                .bindPopup('Ваш ответ')
                .addTo(resultMap);

            GameMap.createCorrectMarker(correctLatLng)
                .bindPopup('Правильный ответ')
                .addTo(resultMap);

            GameMap.createResultLine(guessLatLng, correctLatLng)
                .addTo(resultMap);

            const bounds = L.latLngBounds([guessLatLng, correctLatLng]);
            resultMap.fitBounds(bounds.pad(0.3));
        }, 100);
    }

    // ========================
    //  НАВИГАЦИЯ
    // ========================

    function onNextRound() {
        roundIndex++;

        if (roundIndex < currentSeries.rounds.length) {
            UI.showScreen('game');

            if (gameMap) {
                gameMap.remove();
                gameMap = null;
            }

            setTimeout(() => {
                gameMap = GameMap.create('map');
                startRound();
            }, 100);
        } else {
            UI.showFinalResults(roundResults, totalScore);
            UI.showScreen('final');
        }
    }

    function onBackToMenu() {
        if (gameMap) { gameMap.remove(); gameMap = null; }
        if (resultMap) { resultMap.remove(); resultMap = null; }

        UI.showScreen('menu');
    }

    // ========================
    //  ЗАПУСК
    // ========================

    document.addEventListener('DOMContentLoaded', init);

})();