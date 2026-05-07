// src/ui/pages/settings.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.saveSettings = function() {
    var telegramTokenInput = document.getElementById('telegram-token');
    var telegramChatIdInput = document.getElementById('telegram-chatid');
    var notificationMethodSelect = document.getElementById('notification-method');
    var reminderDays1 = document.getElementById('reminder-days-1')?.value || 7;
    var reminderDays2 = document.getElementById('reminder-days-2')?.value || 2;

    var baseMileageInput = document.getElementById('set-base-mileage');
    var baseMotohoursInput = document.getElementById('set-base-motohours');
    var purchaseDateInput = document.getElementById('purchase-date');

    // 1. Сразу сохраняем точку отсчёта в Store и localStorage
    if (baseMileageInput) App.store.baseMileage = +baseMileageInput.value || 0;
    if (baseMotohoursInput) App.store.baseMotohours = +baseMotohoursInput.value || 0;
    if (purchaseDateInput) App.store.purchaseDate = purchaseDateInput.value;

    App.store.calculateOwnershipDays();
    App.store.saveToLocalStorage();

    var settings = {
        currentMileage: App.store.settings.currentMileage,
        currentMotohours: App.store.settings.currentMotohours,
        avgDailyMileage: App.store.settings.avgDailyMileage,
        avgDailyMotohours: App.store.settings.avgDailyMotohours,
        telegramToken: telegramTokenInput?.value || '',
        telegramChatId: telegramChatIdInput?.value || '',
        notificationMethod: notificationMethodSelect?.value || 'telegram',
        reminderDays: reminderDays1 + ',' + reminderDays2
    };

    App.storage.saveSettings(settings).then(function() {
        if (telegramTokenInput) App.store.settings.telegramToken = telegramTokenInput.value;
        if (telegramChatIdInput) App.store.settings.telegramChatId = telegramChatIdInput.value;
        if (notificationMethodSelect) {
            App.store.settings.notificationMethod = notificationMethodSelect.value;
            localStorage.setItem(App.config.NOTIFICATION_METHOD_KEY, notificationMethodSelect.value);
        }
        App.store.settings.currentMileage = settings.currentMileage;
        App.store.settings.currentMotohours = settings.currentMotohours;
        App.store.settings.reminderDays = settings.reminderDays;
        App.store.saveToLocalStorage();

        document.getElementById('settings-result').textContent = '✅ Сохранено';
        App.toast('Настройки сохранены', 'success');
    }).catch(function(err) {
        console.error(err);
        document.getElementById('settings-result').textContent = '⚠️ Ошибка сохранения';
        App.toast('Ошибка сохранения настроек', 'error');
    });
};

App.ui.pages.populateSettingsFields = function() {
    var telegramTokenInput = document.getElementById('telegram-token');
    var telegramChatIdInput = document.getElementById('telegram-chatid');
    var notificationMethodSelect = document.getElementById('notification-method');

    if (telegramTokenInput) telegramTokenInput.value = App.store.settings.telegramToken || '';
    if (telegramChatIdInput) telegramChatIdInput.value = App.store.settings.telegramChatId || '';
    if (notificationMethodSelect) notificationMethodSelect.value = App.store.settings.notificationMethod || 'telegram';

    if (App.store.settings.reminderDays) {
        var parts = App.store.settings.reminderDays.split(',');
        if (document.getElementById('reminder-days-1')) document.getElementById('reminder-days-1').value = parts[0] || 7;
        if (document.getElementById('reminder-days-2')) document.getElementById('reminder-days-2').value = parts[1] || 2;
    }

    var baseMileageInput = document.getElementById('set-base-mileage');
    var baseMotohoursInput = document.getElementById('set-base-motohours');
    var purchaseDateInput = document.getElementById('purchase-date');
    var ownershipDaysInput = document.getElementById('ownership-days');

    if (baseMileageInput) baseMileageInput.value = App.store.baseMileage || '';
    if (baseMotohoursInput) baseMotohoursInput.value = App.store.baseMotohours || '';
    if (purchaseDateInput) purchaseDateInput.value = App.store.purchaseDate || '';
    if (ownershipDaysInput) ownershipDaysInput.value = App.store.ownershipDays;

    App.ui.pages.updateOwnershipDisplay();
    App.ui.pages.renderSharingList();
};

App.ui.pages.sendTestNotification = function() {
    var title = 'Тест уведомления';
    var body = 'Если вы видите это сообщение — уведомления работают!';
    App.ui.pages.sendNotification(title, body);
};

App.ui.pages.sendNotification = function(title, body, tag) {
    var method = App.store.settings.notificationMethod;
    if (method === 'telegram' || method === 'both') {
        App.ui.pages.sendTelegramMessage(title + '\n' + body);
    }
    if (method === 'push' || method === 'both') {
        App.ui.pages.sendPushNotification(title, body, tag);
    }
};

App.ui.pages.sendTelegramMessage = function(text) {
    if (!App.store.settings.telegramToken || !App.store.settings.telegramChatId) return;
    fetch('https://api.telegram.org/bot' + App.store.settings.telegramToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: App.store.settings.telegramChatId,
            text: text
        })
    }).catch(function(e) { console.warn('Telegram send failed', e); });
};

App.ui.pages.sendPushNotification = function(title, body, tag) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(function(reg) {
        reg.showNotification(title, { body: body, tag: tag, icon: 'icon-192.png' });
    });
};

App.ui.pages.subscribeToPush = function() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Push-уведомления не поддерживаются в этом браузере');
        return;
    }
    Notification.requestPermission().then(function(perm) {
        if (perm !== 'granted') {
            alert('Нет разрешения на уведомления');
            return;
        }
        localStorage.setItem('push_subscribed', 'true');
        var pushStatus = document.getElementById('push-status');
        if (pushStatus) pushStatus.textContent = '✅ Push активны';
    });
};

App.ui.pages.openPhotoFolder = function() {
    App.toast('Фотографии теперь хранятся в Supabase Storage', 'info');
};

App.ui.pages.shareTable = function() {
    window.open('https://docs.google.com/spreadsheets/d/' + App.store.spreadsheetId + '/edit', '_blank');
};

App.ui.pages.handleExport = function() {
    var type = document.getElementById('export-type-select')?.value || 'to';
    var format = document.getElementById('export-format-select')?.value || 'csv';

    if (format === 'csv') {
        var exportData = App.ui.pages.getExportData(type);
        if (exportData && exportData.data) {
            App.ui.pages.exportToCSV(exportData.data, exportData.filename, exportData.headers);
        }
    } else if (format === 'xlsx') {
        if (type === 'all') {
            App.ui.pages.exportToExcelAll();
        } else {
            App.ui.pages.exportToExcelForType(type);
        }
    }
};

App.ui.pages.getExportData = function(type) {
    switch (type) {
        case 'to':
            return {
                data: App.store.operations.map(function(op) {
                    return [op.category, op.name, op.lastDate || '', op.lastMileage || '', op.lastMotohours || '', op.intervalKm, op.intervalMonths, op.intervalMotohours ?? ''];
                }),
                headers: ['Категория', 'Операция', 'Последняя дата', 'Последний пробег', 'Последние моточасы', 'Интервал км', 'Интервал мес', 'Интервал м/ч'],
                filename: 'vesta_operations'
            };
        case 'fuel':
            return {
                data: App.store.fuelLog.map(function(f) {
                    return [f.date, f.mileage, f.liters, f.pricePerLiter, (f.fullTank === 'TRUE' || f.fullTank === true) ? 'Да' : 'Нет', f.fuelType, f.notes || ''];
                }),
                headers: ['Дата', 'Пробег', 'Литры', 'Цена/л', 'Полный бак', 'Тип топлива', 'Примечание'],
                filename: 'vesta_fuel'
            };
        case 'tires':
            return {
                data: App.store.tireLog.map(function(t) {
                    return [t.date, t.type, t.mileage, t.model || '', t.size || '', t.wear || '', t.notes || '', t.purchaseCost || '', t.mountCost || '', t.isDIY ? 'Да' : 'Нет'];
                }),
                headers: ['Дата', 'Тип', 'Пробег', 'Модель', 'Размер', 'Износ', 'Примечание', 'Стоимость покупки', 'Стоимость монтажа', 'DIY'],
                filename: 'vesta_tires'
            };
        case 'parts':
            return {
                data: App.store.parts.map(function(p) {
                    return [p.operation, p.oem, p.analog, p.price, p.supplier, p.link, p.comment, p.inStock || 0, p.location || ''];
                }),
                headers: ['Операция', 'OEM', 'Аналог', 'Цена', 'Поставщик', 'Ссылка', 'Комментарий', 'В наличии (шт.)', 'Место хранения'],
                filename: 'vesta_parts'
            };
        case 'history':
            var filtered = App.ui.pages.getFilteredHistory();
            return {
                data: filtered.map(function(record) {
                    var op = App.store.operations.find(function(o) { return o.id == record.operation_id; });
                    return [record.date || '', op ? op.name : 'Неизвестно', record.mileage || '', record.motohours || '', record.parts_cost || '', record.work_cost || '', record.notes || '', (record.is_diy === 'TRUE' || record.is_diy === true) ? 'Да' : 'Нет'];
                }),
                headers: ['Дата', 'Операция', 'Пробег', 'Моточасы', 'Запчасти (₽)', 'Работа (₽)', 'Примечание', 'DIY'],
                filename: 'vesta_history'
            };
        case 'all':
            App.toast('Функция "Все данные" скачает несколько файлов по очереди.', 'info');
            var types = ['to', 'fuel', 'tires', 'parts', 'history'];
            types.forEach(function(t) {
                var d = App.ui.pages.getExportData(t);
                if (d && d.data.length) App.ui.pages.exportToCSV(d.data, d.filename, d.headers);
            });
            return null;
        default:
            return null;
    }
};

App.ui.pages.exportToCSV = function(data, filename, headers) {
    if (!data || data.length === 0) {
        App.toast('Нет данных для экспорта', 'warning');
        return;
    }
    var csvRows = [];
    if (headers) csvRows.push(headers.join(';'));
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var values = row.map(function(cell) {
            var cellStr = String(cell ?? '').replace(/"/g, '""');
            if (cellStr.indexOf(';') !== -1 || cellStr.indexOf('\n') !== -1 || cellStr.indexOf('"') !== -1) {
                return '"' + cellStr + '"';
            }
            return cellStr;
        });
        csvRows.push(values.join(';'));
    }
    var blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename + '_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    App.toast('Экспорт CSV выполнен', 'success');
};

App.ui.pages.exportToExcelForType = function(type) {
    var wsData, sheetName;
    switch (type) {
        case 'to':
            wsData = XLSX.utils.json_to_sheet(App.store.operations.map(function(op) {
                return { 'Категория': op.category, 'Операция': op.name, 'Последняя дата': op.lastDate || '', 'Последний пробег': op.lastMileage || '', 'Последние моточасы': op.lastMotohours || '', 'Интервал км': op.intervalKm || '', 'Интервал мес': op.intervalMonths || '', 'Интервал м/ч': op.intervalMotohours || '' };
            }));
            sheetName = 'Журнал ТО';
            break;
        case 'fuel':
            wsData = XLSX.utils.json_to_sheet(App.store.fuelLog.map(function(f) {
                return { 'Дата': f.date, 'Пробег': f.mileage, 'Литры': f.liters, 'Цена/л': f.pricePerLiter, 'Полный бак': (f.fullTank === 'TRUE' || f.fullTank === true) ? 'Да' : 'Нет', 'Тип топлива': f.fuelType || 'Бензин', 'Примечание': f.notes || '' };
            }));
            sheetName = 'Топливо';
            break;
        case 'tires':
            wsData = XLSX.utils.json_to_sheet(App.store.tireLog.map(function(t) {
                return { 'Дата': t.date, 'Тип': t.type, 'Пробег': t.mileage, 'Модель': t.model || '', 'Размер': t.size || '', 'Износ': t.wear || '', 'Примечание': t.notes || '', 'Стоимость покупки': t.purchaseCost || '', 'Стоимость монтажа': t.mountCost || '', 'DIY': t.isDIY ? 'Да' : 'Нет' };
            }));
            sheetName = 'Шины';
            break;
        case 'parts':
            wsData = XLSX.utils.json_to_sheet(App.store.parts.map(function(p) {
                return { 'Операция': p.operation, 'OEM': p.oem, 'Аналог': p.analog, 'Цена': p.price, 'Поставщик': p.supplier, 'Ссылка': p.link, 'Комментарий': p.comment, 'В наличии (шт.)': p.inStock || 0, 'Место хранения': p.location || '' };
            }));
            sheetName = 'Запчасти';
            break;
        case 'history':
            wsData = XLSX.utils.json_to_sheet(App.ui.pages.getFilteredHistory().map(function(record) {
                var op = App.store.operations.find(function(o) { return o.id == record.operation_id; });
                return { 'Дата': record.date || '', 'Операция': op ? op.name : 'Неизвестно', 'Пробег': record.mileage || '', 'Моточасы': record.motohours || '', 'Запчасти (₽)': record.parts_cost || '', 'Работа (₽)': record.work_cost || '', 'DIY': (record.is_diy === 'TRUE' || record.is_diy === true) ? 'Да' : 'Нет', 'Примечание': record.notes || '' };
            }));
            sheetName = 'История ТО';
            break;
        default:
            return false;
    }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsData, sheetName);
    var fileName = 'vesta_' + sheetName + '_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.xlsx';
    XLSX.writeFile(wb, fileName);
    return true;
};

App.ui.pages.exportToExcelAll = function() {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.operations.map(function(op) { return { 'Категория': op.category, 'Операция': op.name, 'Последняя дата': op.lastDate || '', 'Последний пробег': op.lastMileage || '', 'Последние моточасы': op.lastMotohours || '', 'Интервал км': op.intervalKm || '', 'Интервал мес': op.intervalMonths || '', 'Интервал м/ч': op.intervalMotohours || '' }; })), 'Журнал ТО');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.parts.map(function(p) { return { 'Операция': p.operation, 'OEM': p.oem, 'Аналог': p.analog, 'Цена': p.price, 'Поставщик': p.supplier, 'Ссылка': p.link, 'Комментарий': p.comment, 'В наличии (шт.)': p.inStock || 0, 'Место хранения': p.location || '' }; })), 'Запчасти');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.fuelLog.map(function(f) { return { 'Дата': f.date, 'Пробег': f.mileage, 'Литры': f.liters, 'Цена/л': f.pricePerLiter, 'Полный бак': (f.fullTank === 'TRUE' || f.fullTank === true) ? 'Да' : 'Нет', 'Тип топлива': f.fuelType || 'Бензин', 'Примечание': f.notes || '' }; })), 'Топливо');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.tireLog.map(function(t) { return { 'Дата': t.date, 'Тип': t.type, 'Пробег': t.mileage, 'Модель': t.model || '', 'Размер': t.size || '', 'Износ': t.wear || '', 'Примечание': t.notes || '', 'Стоимость покупки': t.purchaseCost || '', 'Стоимость монтажа': t.mountCost || '', 'DIY': t.isDIY ? 'Да' : 'Нет' }; })), 'Шины');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.ui.pages.getFilteredHistory().map(function(rec) { var op = App.store.operations.find(function(o) { return o.id == rec.operation_id; }); return { 'Дата': rec.date || '', 'Операция': op ? op.name : 'Неизвестно', 'Пробег': rec.mileage || '', 'Моточасы': rec.motohours || '', 'Запчасти (₽)': rec.parts_cost || '', 'Работа (₽)': rec.work_cost || '', 'DIY': (rec.is_diy === 'TRUE' || rec.is_diy === true) ? 'Да' : 'Нет', 'Примечание': rec.notes || '' }; })), 'История');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(App.store.mileageHistory.map(function(m) { return { 'Дата': m.date, 'Пробег': m.mileage, 'Моточасы': m.motohours || '' }; })), 'Пробег');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Пробег': App.store.settings.currentMileage, 'Моточасы': App.store.settings.currentMotohours, 'Ср. пробег/день': App.store.settings.avgDailyMileage, 'Ср. моточасы/день': App.store.settings.avgDailyMotohours, 'Telegram Token': App.store.settings.telegramToken || '', 'Telegram Chat ID': App.store.settings.telegramChatId || '', 'Способ уведомлений': App.store.settings.notificationMethod || 'telegram', 'Базовый пробег': App.store.baseMileage, 'Базовые моточасы': App.store.baseMotohours, 'Дата покупки': App.store.purchaseDate }]), 'Настройки');
    var fileName = 'vesta_backup_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.xlsx';
    XLSX.writeFile(wb, fileName);
    App.toast('Экспорт в Excel выполнен', 'success');
};

App.ui.pages.generateServiceReport = function() {
    if (typeof html2pdf === 'undefined') {
        App.toast('Библиотека html2pdf не загружена', 'error');
        return;
    }
    var totalMaintenance = App.store.serviceRecords.reduce(function(s, r) { return s + (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0); }, 0);
    var totalFuel = App.store.fuelLog.reduce(function(s, f) { return s + (f.liters * f.pricePerLiter); }, 0);
    var totalCost = totalMaintenance + totalFuel;
    var avgCostPerKm = App.store.settings.currentMileage ? totalCost / App.store.settings.currentMileage : 0;
    var reportHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Сервисная история</title><style>body{font-family:sans-serif;margin:20px}h1{color:#3498db}h2{border-bottom:1px solid #ccc}table{width:100%;border-collapse:collapse;margin-bottom:20px}td,th{border:1px solid #ddd;padding:8px}th{background:#f2f2f2}.stat-card{display:inline-block;background:#f9f9f9;padding:10px;margin:5px;border-radius:8px}</style></head><body><h1>Сервисная история</h1><p><strong>Дата:</strong>' + new Date().toLocaleDateString('ru-RU') + '</p><p><strong>Пробег:</strong>' + App.store.settings.currentMileage.toLocaleString() + ' км</p><h2>Расходы</h2><div>' +
        '<div class="stat-card">ТО: ' + totalMaintenance.toFixed(2) + ' ₽</div><div class="stat-card">Топливо: ' + totalFuel.toFixed(2) + ' ₽</div><div class="stat-card">Всего: ' + totalCost.toFixed(2) + ' ₽</div><div class="stat-card">1 км: ' + avgCostPerKm.toFixed(2) + ' ₽</div></div><h2>Операции</h2><table><thead><tr><th>Категория</th><th>Операция</th><th>Интервал км</th><th>Интервал мес</th><th>Последнее ТО</th><th>Последний пробег</th></tr></thead><tbody>';
    App.store.operations.forEach(function(op) { reportHtml += '<tr><td>' + App.utils.escapeHtml(op.category) + '</td><td>' + App.utils.escapeHtml(op.name) + '</td><td>' + (op.intervalKm || '—') + '</td><td>' + (op.intervalMonths || '—') + '</td><td>' + (op.lastDate || '—') + '</td><td>' + (op.lastMileage || '—') + '</td></tr>'; });
    reportHtml += '</tbody></table><h2>История ТО</h2><table><thead><tr><th>Дата</th><th>Операция</th><th>Пробег</th><th>Запчасти</th><th>Работа</th><th>DIY</th><th>Прим.</th></tr></thead><tbody>';
    App.store.serviceRecords.sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(rec){ var op=App.store.operations.find(function(o){return o.id==rec.operation_id;}); reportHtml+='<tr><td>'+ (rec.date||'')+'</td><td>'+ App.utils.escapeHtml(op?op.name:'Неизвестно')+'</td><td>'+ (rec.mileage||'')+'</td><td>'+ (rec.parts_cost||'0')+'</td><td>'+ (rec.work_cost||'0')+'</td><td>'+ (rec.is_diy===true?'Да':'Нет')+'</td><td>'+ (rec.notes||'')+'</td></tr>'; });
    reportHtml += '</tbody></table></body></html>';
    var element = document.createElement('div');
    element.innerHTML = reportHtml;
    document.body.appendChild(element);
    html2pdf().from(element).set({
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: 'servisnaya_istoriya_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    }).save().finally(function() {
        document.body.removeChild(element);
    });
};

App.ui.pages.forceSync = function() {
    App.toast('Данные уже синхронизированы с Supabase', 'info');
};

// Загрузка и отображение списка со‑владельцев
App.ui.pages.renderSharingList = function() {
    var container = document.getElementById('sharing-container');
    if (!container) return;
    var carId = App.store.activeCarId;
    if (!carId) {
        container.innerHTML = '<p class="hint">Выберите автомобиль</p>';
        App.initIcons();
        return;
    }

    App.supa.getCurrentUserId().then(function(userId) {
        if (!userId) {
            container.innerHTML = '<p class="hint">Не удалось определить пользователя</p>';
            return;
        }

        App.supa.getCarShares(carId).then(function({ data, error }) {
            if (error) {
                container.innerHTML = '<p class="hint">Ошибка загрузки</p>';
                return;
            }

            // Определяем, является ли текущий пользователь владельцем автомобиля
            var car = App.store.cars.find(c => c.id == carId);
            var isOwner = car && car.user_id === userId;

            // Фильтруем приглашения в зависимости от роли
            var shares = data || [];
            if (!isOwner) {
                // Гость видит только своё приглашение
                shares = shares.filter(share => share.invited_user_id === userId);
            }

            if (shares.length === 0) {
                container.innerHTML = '<p class="hint">Нет приглашённых пользователей</p>';
                App.initIcons();
                return;
            }

            var html = '<ul style="list-style:none; padding:0;">';
            shares.forEach(function(share) {
                var statusIcon = share.accepted ? '✅' : '⏳';
                var statusText = share.accepted ? 'Принято' : 'Ожидает';
                var emailOrId = share.invited_email || (share.invited_user_id ? 'ID: ' + share.invited_user_id.substring(0,8) : '—');
                html += '<li style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border);">';
                html += '<span>' + statusIcon + ' <strong>' + App.utils.escapeHtml(emailOrId) + '</strong> (' + statusText + ')</span>';
                // Кнопку удаления показываем только владельцу
                if (isOwner) {
                    html += '<button class="icon-btn remove-share-btn" data-id="' + share.id + '" title="Удалить доступ"><i data-lucide="trash-2"></i></button>';
                }
                html += '</li>';
            });
            html += '</ul>';
            container.innerHTML = html;

            // Обработчики удаления (только для владельца)
            if (isOwner) {
                container.querySelectorAll('.remove-share-btn').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var shareId = btn.dataset.id;
                        if (!confirm('Удалить доступ для этого пользователя?')) return;
                        App.supa.deleteCarShare(shareId).then(function() {
                            App.toast('Доступ удалён', 'success');
                            App.ui.pages.renderSharingList(); // обновить список
                        }).catch(function(err) {
                            console.error(err);
                            App.toast('Ошибка удаления доступа', 'error');
                        });
                    });
                });
            }

            App.initIcons();
        });
    }).catch(function(err) {
        console.error(err);
        container.innerHTML = '<p class="hint">Ошибка загрузки</p>';
    });
};

// ===== Резервные коды =====
App.ui.pages.initRecoveryCodesUI = function() {
    var showBtn = document.getElementById('show-recovery-btn');
    var genBtn = document.getElementById('gen-new-codes-btn');
    if (!showBtn || !genBtn) return;

    showBtn.addEventListener('click', async function() {
        var { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        var { data: codes } = await App.supabase.from('recovery_codes')
            .select('code_hash, used')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        var unused = codes.filter(c => !c.used);
        var listEl = document.getElementById('recovery-codes-list');
        if (!listEl) return;
        if (unused.length === 0) {
            listEl.innerHTML = '<p class="hint">Все коды использованы. Сгенерируйте новые.</p>';
            return;
        }
        listEl.innerHTML = '<p>Неиспользованные коды:</p><ul>' +
            unused.map(c => '<li>' + c.code_hash + '</li>').join('') + '</ul>';
    });

    genBtn.addEventListener('click', async function() {
        var { data: { user } } = await App.supabase.auth.getUser();
        if (!user) return;
        if (!confirm('Старые коды будут удалены. Продолжить?')) return;
        await App.supabase.from('recovery_codes').delete().eq('user_id', user.id);
        var codes = [];
        for (var i = 0; i < 8; i++) {
            var code = Array.from({length: 8}, () => Math.floor(Math.random() * 10)).join('');
            codes.push(code);
            await App.supabase.from('recovery_codes').insert({ user_id: user.id, code_hash: code });
        }
        alert('Новые коды:\n' + codes.join('\n'));
        document.getElementById('show-recovery-btn').click();
    });
};

// Инициализация UI резервных кодов при загрузке
App.ui.pages.initRecoveryCodesUI();

// Инициализация импорта CSV
App.ui.pages.initCsvImport();