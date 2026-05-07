// src/events.js
window.App = window.App || {};
App.events = App.events || {};

App.events.init = function() {
    App.events.setupDelegation();
    App.events.initNavigation();
    App.events.initTheme();
    App.events.initDirectListeners();
    App.events.initHistoryFilters();
    App.events.initStatsListeners();
};

App.events.setupDelegation = function() {
    document.body.addEventListener('click', function(e) {
        var target = e.target.closest('[data-action]');
        if (!target) return;
        var action = target.dataset.action;

        switch (action) {
            case 'add-record':
                var opId = target.dataset.opId;
                var opName = target.dataset.opName;
                if (opId && opName) App.ui.pages.openServiceModal(opId, opName);
                break;
            case 'edit-op':
                var editOpId = target.dataset.opId;
                var op = App.store.operations.find(function(o) { return o.id == editOpId; });
                if (op) App.ui.pages.openOperationForm(op);
                break;
            case 'delete-op':
                var delOpId = target.dataset.opId;
                if (!delOpId) return;
                if (!confirm('Удалить операцию? Это действие нельзя отменить.')) return;
                App.storage.deleteOperation(delOpId).then(function() {
                    App.storage.loadAllData();
                    App.toast('Операция удалена', 'success');
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Не удалось удалить операцию (недостаточно прав)', 'error');
                });
                break;
            case 'calendar':
                // Кнопка в таблице ТО – автоматически добавляет запчасти в описание события
                var calOpId = target.dataset.opId;
                var calOpName = target.dataset.opName;
                var calPlanDate = target.dataset.planDate;
                var calPlanMileage = target.dataset.planMileage;
                if (calOpId && calPlanDate) {
                    App.events.addToCalendar(calOpId, calOpName, calPlanDate, calPlanMileage);
                }
                break;
            case 'shopping-list':
                var shopOpId = target.dataset.opId;
                if (shopOpId) App.ui.pages.generateShoppingList(shopOpId);
                break;
            case 'edit-part':
                var partId = target.dataset.id;
                var part = App.store.parts.find(function(p) { return p.id == partId; });
                if (part) App.ui.pages.openPartForm(part);
                break;
            case 'delete-part':
                var delPartId = target.dataset.id;
                if (!delPartId) return;
                if (!confirm('Удалить запчасть?')) return;
                App.ui.pages.deletePart(delPartId);
                break;
            case 'search-part':
                var oem = target.dataset.oem;
                if (oem) App.ui.pages.showCatalogMenu(target, oem);
                break;
            case 'price-history':
                var histPartId = target.dataset.id;
                var histPart = App.store.parts.find(function(p) { return p.id == histPartId; });
                if (histPart) App.ui.pages.showPriceHistoryChart(histPart);
                break;
            case 'edit-fuel':
                var fuelIdx = parseInt(target.dataset.idx);
                var fuelRec = App.store.fuelLog[fuelIdx];
                if (fuelRec) {
                    fuelRec.id = fuelRec.id;
                    App.ui.pages.openFuelModal(fuelRec);
                }
                break;
            case 'delete-fuel':
                var delFuelIdx = parseInt(target.dataset.idx);
                if (isNaN(delFuelIdx)) return;
                if (!confirm('Удалить заправку?')) return;
                App.ui.pages.deleteFuelEntry(delFuelIdx);
                break;
            case 'edit-tire':
                var tireIdx = parseInt(target.dataset.idx);
                var tireRec = App.store.tireLog[tireIdx];
                if (tireRec) {
                    App.ui.pages.openTireModal(tireRec);
                }
                break;
            case 'delete-tire':
                var delTireIdx = parseInt(target.dataset.idx);
                if (isNaN(delTireIdx)) return;
                if (!confirm('Удалить запись о шинах?')) return;
                App.ui.pages.deleteTireEntry(delTireIdx);
                break;
            case 'edit-history':
                var histRow = target.dataset.row;
                if (histRow) App.ui.pages.openHistoryEdit(histRow);
                break;
            case 'delete-history':
                var delHistRow = target.dataset.row;
                if (!delHistRow) return;
                if (!confirm('Удалить запись из истории? Это действие нельзя отменить.')) return;
                App.ui.pages.deleteHistoryEntry(delHistRow);
                break;
            case 'execute-plan':
                var planOpId = target.dataset.opId;
                var planOpName = target.dataset.opName;
                if (planOpId && planOpName) App.ui.pages.openServiceModal(planOpId, planOpName);
                break;
        }
    });
};

// Функция для быстрого добавления события в календарь с автоподгрузкой запчастей
App.events.addToCalendar = function(opId, opName, planDate, planMileage) {
    var parts = App.store.parts.filter(function(p) {
        var op = App.store.operations.find(function(o) { return o.id == opId; });
        return p.operation === opName || p.operation === (op ? op.category : '');
    });

    var partsList = '';
    if (parts.length > 0) {
        partsList = '\\n\\nСписок запчастей:\\n';
        parts.forEach(function(p) {
            var status = (p.inStock && p.inStock > 0) ? '✅' : '☐';
            partsList += status + ' ' + (p.oem || p.analog || p.operation) + (p.price ? ' (' + p.price + '₽)' : '') + '\\n';
        });
    }

    var description = 'Пробег: ' + (planMileage || '—') + ' км.' + partsList;
    var uid = opId + '-vesta-' + planDate;
    var dtStart = planDate.replace(/-/g, '') + 'T090000';
    var dtEnd   = planDate.replace(/-/g, '') + 'T100000';
    var now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

    var icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vesta Dashboard//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n' +
        'BEGIN:VEVENT\r\n' +
        'UID:' + uid + '\r\n' +
        'DTSTART:' + dtStart + '\r\n' +
        'DTEND:' + dtEnd + '\r\n' +
        'SUMMARY:ТО: ' + opName + '\r\n' +
        'DESCRIPTION:' + description + '\r\n' +
        'DTSTAMP:' + now + '\r\n' +
        'END:VEVENT\r\n' +
        'END:VCALENDAR';
    var blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = opName.replace(/\s/g, '_') + '_' + planDate + '.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    App.toast('Событие календаря скачано', 'success');
};

App.events.initNavigation = function() {
    document.querySelectorAll('.sidebar-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var tab = btn.dataset.tab;
            if (tab) App.events.switchToTab(tab);
        });
    });

    document.querySelectorAll('.bottom-nav-item').forEach(function(btn) {
        if (btn.id === 'more-menu-btn') return;
        btn.addEventListener('click', function() {
            var tab = btn.dataset.tab;
            if (tab) App.events.switchToTab(tab);
            App.events.closeDrawer();
        });
    });

    var moreBtn = document.getElementById('more-menu-btn');
    if (moreBtn) moreBtn.addEventListener('click', App.events.openDrawer);

    var drawer = document.getElementById('drawer-menu');
    if (drawer) {
        drawer.querySelector('.drawer-overlay').addEventListener('click', App.events.closeDrawer);
        drawer.querySelectorAll('.drawer-item[data-tab]').forEach(function(item) {
            item.addEventListener('click', function() {
                App.events.switchToTab(item.dataset.tab);
                App.events.closeDrawer();
            });
        });
        document.getElementById('drawer-theme-toggle')?.addEventListener('click', function() {
            App.events.toggleTheme();
            App.events.closeDrawer();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && drawer && !drawer.classList.contains('hidden')) {
            App.events.closeDrawer();
        }
    });
};

App.events.switchToTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
    var activeTab = document.getElementById('tab-' + tabId);
    if (activeTab) activeTab.classList.add('active');

    document.querySelectorAll('.sidebar-item, .bottom-nav-item').forEach(function(btn) {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });

    switch (tabId) {
        case 'dashboard':
            if (typeof App.ui.pages.renderDashboard === 'function') App.ui.pages.renderDashboard();
            break;
        case 'to':
            var displayMileage = document.getElementById('display-mileage');
            var displayMotohours = document.getElementById('display-motohours');
            var displayAvgMileage = document.getElementById('display-avg-mileage');
            var displayAvgMotohours = document.getElementById('display-avg-motohours');
            if (displayMileage) displayMileage.textContent = App.store.settings.currentMileage;
            if (displayMotohours) displayMotohours.textContent = App.store.settings.currentMotohours;
            if (displayAvgMileage) displayAvgMileage.textContent = App.store.settings.avgDailyMileage;
            if (displayAvgMotohours) displayAvgMotohours.textContent = App.store.settings.avgDailyMotohours;

            if (typeof App.ui.pages.renderTOTable === 'function') App.ui.pages.renderTOTable();
            if (typeof App.ui.pages.renderTop5Widget === 'function') App.ui.pages.renderTop5Widget();
            if (typeof App.ui.pages.renderMaintenancePlan === 'function') App.ui.pages.renderMaintenancePlan();
            break;
        case 'stats':
            if (typeof App.ui.pages.renderStats === 'function') App.ui.pages.renderStats();
            if (typeof App.ui.pages.renderFuelAnalytics === 'function') App.ui.pages.renderFuelAnalytics();
            break;
        case 'history':
            if (typeof App.ui.pages.renderHistoryWithFilters === 'function') App.ui.pages.renderHistoryWithFilters();
            if (typeof App.ui.pages.populateHistoryOperationFilter === 'function') App.ui.pages.populateHistoryOperationFilter();
            break;
        case 'fuel':
            if (typeof App.ui.pages.renderFuelTable === 'function') App.ui.pages.renderFuelTable();
            break;
        case 'tires':
            if (typeof App.ui.pages.renderTiresTable === 'function') App.ui.pages.renderTiresTable();
            break;
        case 'parts':
            if (typeof App.ui.pages.renderPartsTable === 'function') App.ui.pages.renderPartsTable();
            break;
        case 'settings':
            if (typeof App.ui.pages.populateSettingsFields === 'function') App.ui.pages.populateSettingsFields();
            break;
    }

    setTimeout(function() { App.initIcons(); }, 100);
};

App.events.openDrawer = function() {
    var drawer = document.getElementById('drawer-menu');
    if (drawer) {
        drawer.classList.remove('hidden');
        document.body.classList.add('drawer-open');
    }
};

App.events.closeDrawer = function() {
    var drawer = document.getElementById('drawer-menu');
    if (drawer) {
        drawer.classList.add('hidden');
        document.body.classList.remove('drawer-open');
    }
};

App.events.initTheme = function() {
    var savedTheme = localStorage.getItem(App.config.THEME_KEY);
    if (savedTheme) {
        App.events.applyTheme(savedTheme);
    } else {
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        App.events.applyTheme(prefersDark ? 'dark' : 'light');
    }

    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', App.events.toggleTheme);

    var sidebarTheme = document.getElementById('sidebar-theme');
    if (sidebarTheme) sidebarTheme.addEventListener('click', App.events.toggleTheme);
};

App.events.applyTheme = function(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark');
        var themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="sun"></i>';
        var sidebarTheme = document.getElementById('sidebar-theme');
        if (sidebarTheme) sidebarTheme.innerHTML = '<i data-lucide="sun"></i>';
    } else {
        document.body.classList.remove('dark');
        var themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="moon"></i>';
        var sidebarTheme = document.getElementById('sidebar-theme');
        if (sidebarTheme) sidebarTheme.innerHTML = '<i data-lucide="moon"></i>';
    }
    localStorage.setItem(App.config.THEME_KEY, theme);
    App.initIcons();
};

App.events.toggleTheme = function() {
    var isDark = document.body.classList.contains('dark');
    App.events.applyTheme(isDark ? 'light' : 'dark');
};

App.events.initDirectListeners = function() {
    var addOperationBtn = document.getElementById('add-operation-btn');
    if (addOperationBtn) addOperationBtn.addEventListener('click', function() { App.ui.pages.openOperationForm(null); });

    var recalculateBtn = document.getElementById('recalculate-btn');
    if (recalculateBtn) recalculateBtn.addEventListener('click', function() {
        App.ui.pages.renderTOTable();
        App.ui.pages.renderTop5Widget();
    });

    var exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', App.ui.pages.exportToExcelAll);

    var importBtn = document.getElementById('import-btn');
    var importFile = document.getElementById('import-file');
    if (importBtn && importFile) {
        importBtn.addEventListener('click', function() { importFile.click(); });
        importFile.addEventListener('change', App.events.handleImport);
    }

    var updateMileageBtn = document.getElementById('update-mileage-btn');
    if (updateMileageBtn) updateMileageBtn.addEventListener('click', App.events.updateMileageAndAverages);

    var addFuelBtn = document.getElementById('add-fuel-btn');
    if (addFuelBtn) addFuelBtn.addEventListener('click', function() { App.ui.pages.openFuelModal(null); });

    var voiceFuelBtn = document.getElementById('voice-fuel-btn');
    if (voiceFuelBtn) voiceFuelBtn.addEventListener('click', App.ui.pages.startVoiceFuelInput);

    var addTireBtn = document.getElementById('add-tire-btn');
    if (addTireBtn) addTireBtn.addEventListener('click', function() { App.ui.pages.openTireModal(null); });

    var addPartBtn = document.getElementById('add-part-btn');
    if (addPartBtn) addPartBtn.addEventListener('click', function() { App.ui.pages.openPartForm(null); });

    var saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', App.ui.pages.saveSettings);

    var subscribePushBtn = document.getElementById('subscribe-push-btn');
    if (subscribePushBtn) subscribePushBtn.addEventListener('click', App.ui.pages.subscribeToPush);

    var exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) exportDataBtn.addEventListener('click', App.ui.pages.handleExport);

    var generatePlanBtn = document.getElementById('generate-plan-btn');
    if (generatePlanBtn) generatePlanBtn.addEventListener('click', function() { App.ui.pages.renderMaintenancePlan(); });

    var calcPredictionBtn = document.getElementById('calc-prediction-btn');
    if (calcPredictionBtn) calcPredictionBtn.addEventListener('click', App.ui.pages.renderMileagePrediction);

    var generatePdfBtn = document.getElementById('generate-pdf-btn');
    if (generatePdfBtn) generatePdfBtn.addEventListener('click', App.ui.pages.generateServiceReport);

    var toggleOwnershipBtn = document.getElementById('toggle-ownership-unit');
    if (toggleOwnershipBtn) toggleOwnershipBtn.addEventListener('click', App.ui.pages.toggleOwnershipUnit);

    var dashUpdateMileageBtn = document.getElementById('dash-update-mileage-btn');
    if (dashUpdateMileageBtn) dashUpdateMileageBtn.addEventListener('click', function() {
        App.events.switchToTab('to');
        var newMileageInput = document.getElementById('new-mileage');
        if (newMileageInput) setTimeout(function() { newMileageInput.focus(); }, 200);
    });

    var dashAddFuelBtn = document.getElementById('dash-add-fuel-btn');
    if (dashAddFuelBtn) dashAddFuelBtn.addEventListener('click', function() { App.ui.pages.openFuelModal(null); });

    var dashAddServiceBtn = document.getElementById('dash-add-service-btn');
    if (dashAddServiceBtn) dashAddServiceBtn.addEventListener('click', function() {
        var upcoming = document.getElementById('dash-upcoming-container');
        var firstOp = upcoming?.querySelector('.top5-name');
        if (firstOp) {
            var opName = firstOp.textContent;
            var op = App.store.operations.find(function(o) { return o.name === opName; });
            if (op) App.ui.pages.openServiceModal(op.id, op.name);
            else App.events.switchToTab('to');
        } else {
            App.events.switchToTab('to');
        }
    });

    var dashPredictBtn = document.getElementById('dash-predict-btn');
    if (dashPredictBtn) dashPredictBtn.addEventListener('click', function() {
        var target = parseFloat(document.getElementById('dash-target-mileage')?.value);
        if (isNaN(target)) return;
        var result = App.logic.predictMileageDate(target);
        var resultEl = document.getElementById('dash-prediction-result');
        if (resultEl) {
            if (result) {
                resultEl.textContent = 'Ожидаемая дата: ' + result.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
            } else {
                resultEl.textContent = 'Недостаточно данных или некорректный пробег.';
            }
        }
        App.initIcons();
    });

    var resetZoomBtn = document.getElementById('reset-all-zoom');
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', function() {
        ['fuelConsumptionChart', 'fuelPriceChart', 'costsChart'].forEach(function(id) {
            var chart = App.charts.activeCharts[id];
            if (chart && typeof chart.resetZoom === 'function') chart.resetZoom();
        });
    });
};

App.events.initHistoryFilters = function() {
    ['history-period-select', 'history-operation-filter', 'history-search', 'history-diy-only', 'history-cost-min', 'history-cost-max'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            var eventType = (el.tagName === 'INPUT' && el.type === 'checkbox') ? 'change' : (el.tagName === 'INPUT' ? 'input' : 'change');
            el.addEventListener(eventType, App.ui.pages.renderHistoryWithFilters);
        }
    });

    var resetFiltersBtn = document.getElementById('history-reset-filters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            ['history-period-select', 'history-operation-filter', 'history-search', 'history-diy-only', 'history-cost-min', 'history-cost-max'].forEach(function(id) {
                var el = document.getElementById(id);
                if (el) {
                    if (el.type === 'checkbox') el.checked = false;
                    else el.value = '';
                }
            });
            App.ui.pages.renderHistoryWithFilters();
        });
    }
};

App.events.initStatsListeners = function() {
    var periodSelect = document.getElementById('stats-period-select');
    if (periodSelect) {
        periodSelect.value = localStorage.getItem(App.config.STATS_PERIOD_KEY) || 'all';
        periodSelect.addEventListener('change', function() {
            localStorage.setItem(App.config.STATS_PERIOD_KEY, periodSelect.value);
            if (document.getElementById('tab-stats')?.classList.contains('active')) {
                App.ui.pages.renderStats();
                App.ui.pages.renderFuelAnalytics();
            }
        });
    }
};

App.events.handleImport = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
        try {
            var d = JSON.parse(ev.target.result);
            App.store.operations = d.operations || [];
            App.store.settings = d.settings || App.defaults.settings;
            App.store.parts = d.parts || [];
            App.store.fuelLog = d.fuelLog || [];
            App.store.tireLog = d.tireLog || [];
            App.store.workCosts = d.workCosts || [];
            App.store.saveToLocalStorage();
            if (typeof App.renderAll === 'function') App.renderAll();
            App.toast('Импорт выполнен', 'success');
        } catch (err) {
            App.toast('Ошибка импорта', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

App.events.updateMileageAndAverages = function() {
    var m = document.getElementById('new-mileage');
    var h = document.getElementById('new-motohours');
    if (!m || !h) {
        alert('Поля не найдены');
        return;
    }
    var newM = App.utils.validateNumberInput(m, false);
    var newH = App.utils.validateNumberInput(h, true);
    if (newM === null || newH === null) return;

    var today = new Date().toISOString().split('T')[0];
    App.storage.addMileageRecord(today, newM, newH);
    App.store.mileageHistory.push({
        uuid: crypto.randomUUID(),
        date: today,
        mileage: newM,
        motohours: newH
    });
    App.store.mileageHistory.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

    if (App.store.mileageHistory.length >= 2) {
        var last = App.store.mileageHistory[App.store.mileageHistory.length - 1];
        var prev = App.store.mileageHistory[App.store.mileageHistory.length - 2];
        var days = (new Date(last.date) - new Date(prev.date)) / 86400000;
        if (days > 0) {
            App.store.settings.avgDailyMileage = (last.mileage - prev.mileage) / days;
            App.store.settings.avgDailyMotohours = (last.motohours - prev.motohours) / days;
        }
    } else {
        App.store.settings.avgDailyMileage = App.store.baseMileage > 0 ? (newM - App.store.baseMileage) / 30 : 20;
        App.store.settings.avgDailyMotohours = App.store.baseMotohours > 0 ? (newH - App.store.baseMotohours) / 30 : 1.65;
    }

    App.store.settings.currentMileage = newM;
    App.store.settings.currentMotohours = newH;

  // Сохранение пробега и моточасов в Supabase
if (App.config.USE_SUPABASE) {
    App.storage.addMileageRecord(today, newM, newH)
        .then(function() {
            // Передаём объект с текущими показателями
            return App.storage.saveSettings({
                currentMileage: newM,
                currentMotohours: newH,
                avgDailyMileage: App.store.settings.avgDailyMileage,
                avgDailyMotohours: App.store.settings.avgDailyMotohours,
                telegramToken: App.store.settings.telegramToken,
                telegramChatId: App.store.settings.telegramChatId,
                notificationMethod: App.store.settings.notificationMethod
            });
        })
        .catch(function(err) {
            console.error('Ошибка сохранения пробега в Supabase:', err);
        });
}

    if (typeof App.renderAll === 'function') App.renderAll();
    if (typeof App.ui.pages.renderTop5Widget === 'function') App.ui.pages.renderTop5Widget();
    App.toast('Пробег и моточасы обновлены', 'success');
};