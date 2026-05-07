// src/ui/pages/stats.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

/**
 * Рендеринг числовых показателей на вкладке "Статистика".
 */
App.ui.pages.renderStats = function() {
    var dataPanel = document.getElementById('data-panel');
    if (!dataPanel || dataPanel.style.display === 'none') return;

    var periodSelect = document.getElementById('stats-period-select');
    var period = periodSelect ? periodSelect.value : 'all';
    var stats = App.logic.calculateStatistics(period);

    if (stats) {
        var totalMaintEl = document.getElementById('total-maintenance-cost');
        var totalFuelEl = document.getElementById('total-fuel-cost');
        var costKmEl = document.getElementById('cost-per-km');
        var avgConsEl = document.getElementById('avg-fuel-consumption');
        var avgMileageEl = document.getElementById('avg-mileage-per-day');
        var avgMotoEl = document.getElementById('avg-motohours-per-day');

        if (totalMaintEl) totalMaintEl.textContent = (stats.totalMaintenanceCost ?? 0).toFixed(0);
        if (totalFuelEl) totalFuelEl.textContent = (stats.totalFuelCost ?? 0).toFixed(0);
        if (costKmEl) costKmEl.textContent = (stats.costPerKm ?? 0).toFixed(2);
        if (avgConsEl) avgConsEl.textContent = (stats.avgFuelConsumption ?? 0).toFixed(1);
        if (avgMileageEl) avgMileageEl.textContent = (stats.avgMileagePerDay ?? 0).toFixed(1);
        if (avgMotoEl) avgMotoEl.textContent = (stats.avgMotohoursPerDay ?? 0).toFixed(2);

        App.ui.pages.updateOwnershipDisplay();
    }

    // Если вкладка активна, рендерим графики и индикаторы
    if (document.getElementById('tab-stats') && document.getElementById('tab-stats').classList.contains('active')) {
        // Прогресс замены масла
        App.charts.renderOilChart();
    }

    App.initIcons();
};

/**
 * Рендеринг всех графиков и индикаторов на вкладке статистики.
 */
App.ui.pages.renderFuelAnalytics = function() {
    App.charts.renderFuelConsumptionChart();
    App.charts.renderFuelPriceChart();
    App.charts.renderCostsChart();
    App.charts.renderExpensePieChart();
    App.charts.updateDrivingModeIndicator();
    App.initIcons();
};

/**
 * Прогноз даты достижения пробега.
 */
App.ui.pages.renderMileagePrediction = function() {
    var targetInput = document.getElementById('prediction-target');
    var resultSpan = document.getElementById('prediction-result');
    if (!targetInput || !resultSpan) return;
    var target = parseInt(targetInput.value);
    if (isNaN(target) || target <= 0) {
        resultSpan.textContent = 'Введите целевой пробег';
        App.initIcons();
        return;
    }
    var predicted = App.logic.predictMileageDate(target);
    if (!predicted) {
        resultSpan.textContent = 'Недостаточно данных для прогноза (нужно минимум 2 записи).';
    } else {
        var options = { year: 'numeric', month: 'long', day: 'numeric' };
        resultSpan.textContent = 'Ожидаемая дата достижения ' + target.toLocaleString() + ' км: ' + predicted.toLocaleDateString('ru-RU', options);
    }
    App.initIcons();
};

/**
 * Обновление отображения дней/лет владения.
 */
App.ui.pages.updateOwnershipDisplay = function() {
    var displayEl = document.getElementById('ownership-display');
    var unitEl = document.getElementById('ownership-unit');
    if (!displayEl || !unitEl) return;
    if (App.store.ownershipDisplayMode === 'days') {
        displayEl.textContent = App.store.ownershipDays;
        unitEl.textContent = 'дней';
    } else {
        displayEl.textContent = (App.store.ownershipDays / 365.25).toFixed(1);
        unitEl.textContent = 'лет';
    }
};

/**
 * Переключение режима отображения владения (дни/годы).
 */
App.ui.pages.toggleOwnershipUnit = function() {
    App.store.ownershipDisplayMode = App.store.ownershipDisplayMode === 'days' ? 'years' : 'days';
    App.ui.pages.updateOwnershipDisplay();
};