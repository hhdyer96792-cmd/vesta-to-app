// src/ui/pages/dashboard.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.renderDashboard = function() {
    var dataPanel = document.getElementById('data-panel');
    if (!dataPanel || dataPanel.style.display === 'none') return;

    var stats = App.logic.calculateStatistics('6months');

    document.getElementById('dash-mileage').textContent = App.store.settings.currentMileage.toLocaleString();
    document.getElementById('dash-motohours').textContent = App.store.settings.currentMotohours.toLocaleString();
    document.getElementById('dash-avg-consumption').textContent = stats.avgFuelConsumption.toFixed(1);
    document.getElementById('dash-cost-km').textContent = stats.costPerKm.toFixed(2);

    var mode = App.logic.getDrivingMode();
    document.getElementById('dash-driving-mode').textContent = mode.text;
    document.getElementById('dash-driving-hint').textContent = mode.hint;

    // Виджет ближайших ТО
    App.ui.pages.renderTop5Widget();
    var top5Container = document.getElementById('top5-container');
    var dashUpcoming = document.getElementById('dash-upcoming-container');
    if (top5Container && dashUpcoming) {
        dashUpcoming.innerHTML = top5Container.innerHTML;
        var items = dashUpcoming.querySelectorAll('.top5-item');
        items.forEach(function(item) {
            var nameEl = item.querySelector('.top5-name');
            if (!nameEl) return;
            var opName = nameEl.textContent;
            var op = App.store.operations.find(function(o) { return o.name === opName; });
            if (!op) return;
            var btn = document.createElement('button');
            btn.className = 'icon-btn execute-dash-btn';
            btn.innerHTML = '<i data-lucide="check-circle"></i>';
            btn.title = 'Выполнить';
            btn.addEventListener('click', function() {
                App.ui.pages.openServiceModal(op.id, op.name);
            });
            item.appendChild(btn);
        });
    }

    // Мини-графики
    App.charts.renderMiniFuelConsumptionChart();
    App.charts.renderMiniCostsChart();
    App.charts.renderMiniExpensePieChart();

    // Износ шин
    App.ui.pages.renderTireWearMini();

    // Уведомления теперь отправляются Edge Function daily-reminder по расписанию
    // вызов sendPushAndTelegramReminders() удалён

    App.initIcons();
};

// Функция sendPushAndTelegramReminders() удалена, чтобы не дублировать Edge Function

App.ui.pages.renderTop5Widget = function() {
    var container = document.getElementById('top5-container');
    if (!container) return;

    var candidates = App.store.operations.filter(function(op) {
        if (!op.intervalKm && !op.intervalMonths && !op.intervalMotohours) return false;
        var plan = App.logic.calculatePlan(op);
        return plan.daysLeft !== null && isFinite(plan.daysLeft) && plan.planDate;
    });

    if (candidates.length === 0) {
        container.innerHTML = '<p class="hint">Нет данных для отображения</p>';
        return;
    }

    var linkedPairs = App.config.LINKED_PAIRS || [];
    var groupedOps = [];
    var usedIds = new Set();

    candidates.forEach(function(op) {
        if (usedIds.has(op.id)) return;
        var isMainOfPair = false;
        var pair = null;
        for (var i = 0; i < linkedPairs.length; i++) {
            if (op.name === linkedPairs[i].main) {
                isMainOfPair = true;
                pair = linkedPairs[i];
                break;
            }
        }
        if (isMainOfPair) {
            var linkedOp = candidates.find(function(o) {
                return o.name === pair.linked && !usedIds.has(o.id);
            });
            if (linkedOp) {
                var mainPlan = App.logic.calculatePlan(op);
                var linkedPlan = App.logic.calculatePlan(linkedOp);
                var primaryPlan = mainPlan.daysLeft <= linkedPlan.daysLeft ? mainPlan : linkedPlan;
                var primaryOp = mainPlan.daysLeft <= linkedPlan.daysLeft ? op : linkedOp;
                groupedOps.push({
                    name: pair.combinedName,
                    op: primaryOp,
                    plan: primaryPlan,
                    isGroup: true
                });
                usedIds.add(op.id);
                usedIds.add(linkedOp.id);
                return;
            }
        }
        var isLinkedInPair = false;
        for (var j = 0; j < linkedPairs.length; j++) {
            if (op.name === linkedPairs[j].linked) {
                isLinkedInPair = true;
                break;
            }
        }
        if (isLinkedInPair) {
            var mainOp = candidates.find(function(o) {
                for (var k = 0; k < linkedPairs.length; k++) {
                    if (linkedPairs[k].linked === op.name && o.name === linkedPairs[k].main && !usedIds.has(o.id)) {
                        return true;
                    }
                }
                return false;
            });
            if (mainOp) return;
        }
        if (!usedIds.has(op.id)) {
            groupedOps.push({
                name: op.name,
                op: op,
                plan: App.logic.calculatePlan(op),
                isGroup: false
            });
            usedIds.add(op.id);
        }
    });

    var sorted = groupedOps.sort(function(a, b) { return a.plan.daysLeft - b.plan.daysLeft; });
    var top5 = sorted.slice(0, 5);

    var html = '';
    top5.forEach(function(item) {
        var op = item.op;
        var plan = item.plan;
        var motoFresh = true;
        if (op.name.indexOf('Масло') !== -1 && op.category.indexOf('ДВС') !== -1 && App.store.mileageHistory.length >= 1) {
            var lastEntry = App.store.mileageHistory[App.store.mileageHistory.length - 1];
            if ((App.store.settings.currentMotohours - lastEntry.motohours) > 20 ||
                (App.store.settings.currentMileage - lastEntry.mileage) > 500) {
                motoFresh = false;
            }
        }
        var percent = 0;
        if (op.intervalKm && plan.planMileage > (op.lastMileage || 0)) {
            percent = Math.min(100, Math.round((App.store.settings.currentMileage - (op.lastMileage || 0)) / (plan.planMileage - (op.lastMileage || 0)) * 100));
        } else if (op.intervalMotohours && motoFresh && plan.recMotohours > (op.lastMotohours || 0)) {
            percent = Math.min(100, Math.round((App.store.settings.currentMotohours - (op.lastMotohours || 0)) / (plan.recMotohours - (op.lastMotohours || 0)) * 100));
        } else if (op.intervalMonths) {
            var lastDate = op.lastDate ? new Date(op.lastDate) : new Date();
            var totalDays = op.intervalMonths * 30;
            var elapsed = Math.floor((new Date() - lastDate) / 86400000);
            percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
        }
        if (percent < 0) percent = 0;

        var daysLeft = plan.daysLeft;
        var mileageLeft = plan.planMileage - App.store.settings.currentMileage;
        var motoLeft = plan.recMotohours ? (plan.recMotohours - App.store.settings.currentMotohours) : null;
        var statusText = daysLeft < 0 ? '⚠️ просрочено на ' + Math.abs(daysLeft) + ' дн.' : 'осталось ' + daysLeft + ' дн.';
        if (mileageLeft > 0 && op.intervalKm) statusText += ' / ' + mileageLeft + ' км';
        else if (motoLeft > 0 && op.intervalMotohours && motoFresh) statusText += ' / ' + motoLeft.toFixed(0) + ' м/ч';

        html += '<div class="top5-item">' +
            '<div class="top5-header">' +
                '<span class="top5-name">' + App.utils.escapeHtml(item.name) + '</span>' +
                '<span class="top5-stats">' + statusText + '</span>' +
            '</div>' +
            '<div class="top5-progress-container">' +
                '<div class="top5-progress-bar" style="width: ' + percent + '%;"></div>' +
            '</div>' +
        '</div>';
    });
    container.innerHTML = html;
    App.initIcons();
};

App.ui.pages.renderTireWearMini = function() {
    var container = document.getElementById('dash-tire-wear-container');
    if (!container) return;
    var summerTires = App.store.tireLog.filter(function(t) { return t.type === 'Лето'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var winterTires = App.store.tireLog.filter(function(t) { return t.type === 'Зима'; })
        .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var summerLast = summerTires[0];
    var winterLast = winterTires[0];

    function buildWearCard(tire, type) {
        if (!tire) return '<div class="wear-card-item"><h4>' + type + '</h4><p class="hint">Нет данных</p></div>';
        var wearPercent = 0;
        var wearValue = tire.wear ? parseFloat(tire.wear) : 0;
        if (type === 'Лето') {
            var minWear = 1.6;
            var maxDepth = 8;
            var currentDepth = Math.min(maxDepth, Math.max(minWear, wearValue));
            wearPercent = ((maxDepth - currentDepth) / (maxDepth - minWear)) * 100;
            wearPercent = Math.min(100, Math.max(0, wearPercent));
        } else {
            wearPercent = Math.min(100, Math.max(0, 100 - wearValue));
        }
        var statusColor = wearPercent < 50 ? '#2ecc71' : (wearPercent < 80 ? '#f39c12' : '#e74c3c');
        return '<div class="wear-card-item" style="flex:1; min-width:200px; background:var(--card-bg); padding:12px; border-radius:12px;">' +
            '<h4>' + type + ' шины</h4>' +
            '<p>Модель: ' + App.utils.escapeHtml(tire.model || '—') + '<br>Размер: ' + App.utils.escapeHtml(tire.size || '—') + '<br>Пробег на установке: ' + (tire.mileage || 0) + ' км</p>' +
            '<div style="margin-top:12px;">' +
                '<div style="display:flex; justify-content:space-between;"><span>Износ:</span><span>' + wearPercent.toFixed(0) + '%</span></div>' +
                '<div class="progress-bar-container" style="height:12px;"><div class="progress-bar" style="width:' + wearPercent + '%; background:' + statusColor + ';"></div></div>' +
                '<p class="hint">' + (type === 'Лето' ? 'Остаток протектора: ' + wearValue + ' мм (мин. 1.6 мм)' : 'Остаток шипов: ' + (100 - wearValue) + '%') + '</p>' +
            '</div>' +
        '</div>';
    }
    container.innerHTML = buildWearCard(summerLast, 'Лето') + buildWearCard(winterLast, 'Зима');
    App.initIcons();
};

// Эта функция вызывается после полной загрузки данных, чтобы обновить текущую вкладку (включая дашборд)
App.renderAll = function() {
    var dataPanel = document.getElementById('data-panel');
    if (!dataPanel || dataPanel.style.display === 'none') return;

    var displayMileage = document.getElementById('display-mileage');
    var displayMotohours = document.getElementById('display-motohours');
    var displayAvgMileage = document.getElementById('display-avg-mileage');
    var displayAvgMotohours = document.getElementById('display-avg-motohours');
    if (displayMileage) displayMileage.textContent = App.store.settings.currentMileage;
    if (displayMotohours) displayMotohours.textContent = App.store.settings.currentMotohours;
    if (displayAvgMileage) displayAvgMileage.textContent = App.store.settings.avgDailyMileage;
    if (displayAvgMotohours) displayAvgMotohours.textContent = App.store.settings.avgDailyMotohours;

    var activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    var tabId = activeTab.id.replace('tab-', '');

    switch (tabId) {
        case 'dashboard':
            App.ui.pages.renderDashboard();
            break;
        case 'to':
            App.ui.pages.renderTOTable();
            break;
        case 'fuel':
            App.ui.pages.renderFuelTable();
            break;
        case 'tires':
            App.ui.pages.renderTiresTable();
            break;
        case 'parts':
            App.ui.pages.renderPartsTable();
            break;
        case 'history':
            App.ui.pages.renderHistoryWithFilters();
            break;
        case 'stats':
            App.ui.pages.renderStats();
            App.ui.pages.renderFuelAnalytics();
            break;
        case 'settings':
            App.ui.pages.populateSettingsFields();
            break;
    }

    App.initIcons();
};