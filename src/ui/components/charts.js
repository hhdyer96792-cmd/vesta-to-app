// src/ui/components/charts.js
window.App = window.App || {};
App.charts = App.charts || {};

// Хранилище активных графиков для возможности уничтожения
App.charts.activeCharts = {};

/**
 * Уничтожает график по ID canvas и удаляет из хранилища.
 * @param {string} canvasId - ID элемента canvas
 */
App.charts.destroyChart = function(canvasId) {
    if (App.charts.activeCharts[canvasId]) {
        App.charts.activeCharts[canvasId].destroy();
        delete App.charts.activeCharts[canvasId];
    }
};

/* ================================================================
   ГРАФИКИ ДЛЯ ВКЛАДКИ "СТАТИСТИКА"
   ================================================================ */

/**
 * График расхода топлива по месяцам (л/100 км)
 */
App.charts.renderFuelConsumptionChart = function() {
    App.charts.destroyChart('fuelConsumptionChart');
    var canvas = document.getElementById('fuelConsumptionChart');
    if (!canvas) return;
    var monthly = App.logic.groupFuelByMonth();
    var labels = monthly.map(function(m) { return m.yearMonth; });
    var data = monthly.map(function(m) {
        return m.avgConsumption !== null ? parseFloat(m.avgConsumption.toFixed(1)) : null;
    });

    if (data.filter(function(v) { return v !== null; }).length === 0) {
        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['fuelConsumptionChart'] = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { title: { display: true, text: 'л/100 км' } } }
            }
        });
        return;
    }

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['fuelConsumptionChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Расход (л/100 км)',
                data: data,
                borderColor: '#e67e22',
                backgroundColor: 'rgba(230,126,34,0.1)',
                tension: 0.2,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ctx.raw + ' л/100 км'; }
                    }
                },
                legend: { position: 'top' },
                zoom: {
                    pan: { enabled: true, mode: 'x', speed: 10 },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        speed: 0.1,
                        limits: { x: { min: 0.5, max: 5 } }
                    }
                }
            },
            scales: {
                y: { title: { display: true, text: 'л/100 км' }, beginAtZero: true }
            }
        }
    });
    App.initIcons();
};

/**
 * График средней цены топлива по месяцам (₽/л)
 */
App.charts.renderFuelPriceChart = function() {
    App.charts.destroyChart('fuelPriceChart');
    var canvas = document.getElementById('fuelPriceChart');
    if (!canvas) return;
    var monthly = App.logic.groupFuelByMonth();
    var labels = monthly.map(function(m) { return m.yearMonth; });
    var data = monthly.map(function(m) {
        return m.avgPrice !== null ? parseFloat(m.avgPrice.toFixed(2)) : null;
    });

    if (data.filter(function(v) { return v !== null; }).length === 0) {
        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['fuelPriceChart'] = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { title: { display: true, text: '₽/л' } } }
            }
        });
        return;
    }

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['fuelPriceChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Средняя цена (₽/л)',
                data: data,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52,152,219,0.1)',
                tension: 0.2,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ctx.raw + ' ₽/л'; }
                    }
                },
                legend: { position: 'top' },
                zoom: {
                    pan: { enabled: true, mode: 'x', speed: 10 },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        speed: 0.1,
                        limits: { x: { min: 0.5, max: 5 } }
                    }
                }
            },
            scales: {
                y: { title: { display: true, text: '₽/л' }, beginAtZero: true }
            }
        }
    });
    App.initIcons();
};

/**
 * График затрат на топливо и ТО по месяцам (столбчатый)
 */
App.charts.renderCostsChart = function(period) {
    App.charts.destroyChart('costsChart');
    var canvas = document.getElementById('costsChart');
    if (!canvas) return;
    period = period || document.getElementById('stats-period-select')?.value || 'all';
    var grouped = App.logic.groupCostsByMonth(period);
    var months = grouped.months;
    var fuelCosts = grouped.fuelCosts;
    var toCosts = grouped.toCosts;

    if (months.length === 0) {
        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['costsChart'] = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true },
                    tooltip: { callbacks: { title: function() { return 'Нет данных'; } } }
                },
                scales: { y: { title: { display: true, text: '₽' } } }
            }
        });
        return;
    }

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['costsChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Топливо (₽)',
                    data: fuelCosts,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: '#2980b9',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: 'ТО (запчасти + работы) (₽)',
                    data: toCosts,
                    backgroundColor: 'rgba(231, 76, 60, 0.7)',
                    borderColor: '#c0392b',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.raw.toFixed(2) + ' ₽';
                        }
                    }
                },
                legend: { position: 'top' },
                zoom: {
                    pan: { enabled: true, mode: 'x', speed: 10 },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        speed: 0.1,
                        limits: { x: { min: 0.5, max: 5 } }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Затраты (₽)' },
                    ticks: { callback: function(value) { return value.toLocaleString(); } }
                },
                x: {
                    title: { display: true, text: 'Месяц' },
                    ticks: { maxRotation: 45, minRotation: 45 }
                }
            }
        }
    });
    App.initIcons();
};

/**
 * Круговая диаграмма распределения затрат по категориям
 */
App.charts.renderExpensePieChart = function(period) {
    App.charts.destroyChart('expensePieChart');
    var canvas = document.getElementById('expensePieChart');
    if (!canvas) return;
    period = period || document.getElementById('stats-period-select')?.value || 'all';
    var structure = App.logic.calculateExpenseStructure(period);
    var labels = structure.labels;
    var values = structure.values;
    var colors = structure.colors;

    if (values.length === 0) {
        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['expensePieChart'] = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Нет данных'], datasets: [{ data: [1], backgroundColor: ['#ccc'] }] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { title: function() { return 'Нет данных за период'; } } }
                }
            }
        });
        return;
    }

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['expensePieChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '50%',
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            var label = context.label || '';
                            var value = context.raw;
                            var total = context.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                            var percent = ((value / total) * 100).toFixed(1);
                            return label + ': ' + value.toFixed(2) + ' ₽ (' + percent + '%)';
                        }
                    }
                }
            }
        }
    });
    App.initIcons();
};

/**
 * Круговая диаграмма прогресса замены масла (маленькая)
 */
App.charts.renderOilChart = function() {
    App.charts.destroyChart('oilChart');
    var canvas = document.getElementById('oilChart');
    if (!canvas) return;
    var oilOp = App.store.operations.find(function(op) {
        return op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1;
    });
    if (!oilOp) return;
    var plan = App.logic.calculatePlan(oilOp);
    var current = App.store.settings.currentMileage;
    var last = oilOp.lastMileage || 0;
    var next = plan.planMileage;
    var percent = Math.min(100, Math.max(0, Math.round((current - last) / (next - last) * 100)));

    var ctx = canvas.getContext('2d');
    App.charts.activeCharts['oilChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Пройдено', 'Осталось'],
            datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#2ecc71', '#e0e0e0'] }]
        },
        options: {
            cutout: '70%',
            plugins: { legend: { display: false } }
        }
    });
    App.initIcons();
};

/* ================================================================
   МИНИ-ГРАФИКИ ДЛЯ ДАШБОРДА
   ================================================================ */

/**
 * Мини-график расхода топлива (дашборд)
 */
App.charts.renderMiniFuelConsumptionChart = function() {
    var canvas = document.getElementById('dash-fuel-consumption-chart');
    if (!canvas) return;
    if (App.charts._dashFuelChart) {
        App.charts._dashFuelChart.destroy();
    }
    var monthly = App.logic.groupFuelByMonth().slice(-6);
    var labels = monthly.map(function(m) { return m.yearMonth; });
    var data = monthly.map(function(m) { return m.avgConsumption; });

    var ctx = canvas.getContext('2d');
    App.charts._dashFuelChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                borderColor: '#e67e22',
                tension: 0.2,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) { return ctx.raw + ' л/100 км'; }
                    }
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
};

/**
 * Мини-график затрат (дашборд)
 */
App.charts.renderMiniCostsChart = function() {
    var canvas = document.getElementById('dash-costs-chart');
    if (!canvas) return;
    if (App.charts._dashCostsChart) {
        App.charts._dashCostsChart.destroy();
    }
    var grouped = App.logic.groupCostsByMonth('6months');
    var months = grouped.months;
    var fuelCosts = grouped.fuelCosts;
    var toCosts = grouped.toCosts;

    var ctx = canvas.getContext('2d');
    App.charts._dashCostsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Топливо', data: fuelCosts, backgroundColor: '#3498db' },
                { label: 'ТО', data: toCosts, backgroundColor: '#e74c3c' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: function(ctx) { return ctx.raw + ' ₽'; } } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return v + ' ₽'; } } } }
        }
    });
};

/**
 * Мини-круговая диаграмма расходов (дашборд)
 */
App.charts.renderMiniExpensePieChart = function() {
    var canvas = document.getElementById('dash-expense-pie-chart');
    if (!canvas) return;
    if (App.charts._dashPieChart) {
        App.charts._dashPieChart.destroy();
    }
    var structure = App.logic.calculateExpenseStructure('6months');

    var ctx = canvas.getContext('2d');
    App.charts._dashPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: structure.labels,
            datasets: [{ data: structure.values, backgroundColor: structure.colors }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
};

/**
 * Обновление индикатора режима вождения на странице статистики
 */
App.charts.updateDrivingModeIndicator = function() {
    var modeSpan = document.getElementById('driving-mode');
    var hintSpan = document.getElementById('driving-mode-hint');
    if (!modeSpan) return;
    var modeData = App.logic.getDrivingMode();
    modeSpan.textContent = modeData.text;
    if (hintSpan) hintSpan.textContent = modeData.hint;
    var container = document.getElementById('driving-mode-indicator');
    if (container) {
        container.classList.remove('city', 'highway', 'mixed');
        if (modeData.text.indexOf('Городской') !== -1) container.classList.add('city');
        else if (modeData.text.indexOf('Трассовый') !== -1) container.classList.add('highway');
        else if (modeData.text.indexOf('Смешанный') !== -1) container.classList.add('mixed');
    }
};