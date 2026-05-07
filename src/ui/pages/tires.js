// src/ui/pages/tires.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.renderTiresTable = function() {
    var tbody = document.getElementById('tires-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    App.store.tireLog.forEach(function(t, i) {
        if (!t.date) return;
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + App.utils.escapeHtml(t.date) + '</td>' +
            '<td>' + App.utils.escapeHtml(t.type || '') + '</td>' +
            '<td>' + (t.mileage || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(t.model || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(t.size || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(t.wear || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(t.notes || '') + '</td>' +
            '<td>' +
                '<button class="icon-btn" data-action="edit-tire" data-idx="' + i + '"><i data-lucide="pencil"></i></button>' +
                '<button class="icon-btn" data-action="delete-tire" data-idx="' + i + '"><i data-lucide="trash-2"></i></button>' +
            '</td>';
        tbody.appendChild(tr);
    });
    App.ui.pages.renderTireWear();
    App.ui.pages.renderTireCalculator();
    App.initIcons();
};

App.ui.pages.renderTireWear = function() {
    var container = document.getElementById('tire-wear-container');
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

// Вспомогательные функции для шинного калькулятора остаются без изменений
App.ui.pages.parseTireSize = function(sizeStr) {
    var match = sizeStr.match(/(\d+)[\/\-](\d+)[\/\-R](\d+)/i);
    if (!match) return null;
    return { width: parseInt(match[1]), aspect: parseInt(match[2]), diameter: parseInt(match[3]) };
};

App.ui.pages.calculateTireDiameter = function(width, aspect, diameter) {
    var sidewallHeight = (width * aspect) / 100;
    var diameterMm = diameter * 25.4;
    return diameterMm + sidewallHeight * 2;
};

App.ui.pages.formatTireInput = function(inputElement) {
    var val = inputElement.value.replace(/\D/g, '');
    if (val.length === 0) return;
    var formatted = '';
    if (val.length <= 3) {
        formatted = val;
    } else if (val.length <= 5) {
        formatted = val.slice(0, 3) + '/' + val.slice(3);
    } else {
        formatted = val.slice(0, 3) + '/' + val.slice(3, 5) + 'R' + val.slice(5, 7);
    }
    inputElement.value = formatted;
};

App.ui.pages.initTireInputs = function() {
    if (App.ui.pages._tireInputsInitialized) return;
    var oldInput = document.getElementById('old-tire-size');
    var newInput = document.getElementById('new-tire-size');
    if (!oldInput || !newInput) return;
    var handler = function(e) { App.ui.pages.formatTireInput(e.target); };
    oldInput.addEventListener('input', handler);
    newInput.addEventListener('input', handler);
    App.ui.pages._tireInputsInitialized = true;
};

App.ui.pages.renderTireCalculator = function() {
    var oldInput = document.getElementById('old-tire-size');
    var newInput = document.getElementById('new-tire-size');
    var calcBtn = document.getElementById('calc-tire-btn');
    var resultDiv = document.getElementById('tire-calc-result');
    if (!calcBtn) return;
    App.ui.pages.initTireInputs();
    var newBtn = calcBtn.cloneNode(true);
    calcBtn.parentNode.replaceChild(newBtn, calcBtn);
    newBtn.addEventListener('click', function() {
        var oldSize = oldInput.value.trim();
        var newSize = newInput.value.trim();
        if (!oldSize || !newSize) {
            resultDiv.innerHTML = '<i data-lucide="alert-triangle"></i> Введите оба размера (пример: 205/55R16)';
            App.initIcons();
            return;
        }
        oldSize = oldSize.replace(/\s/g, '');
        newSize = newSize.replace(/\s/g, '');
        var oldParsed = App.ui.pages.parseTireSize(oldSize);
        var newParsed = App.ui.pages.parseTireSize(newSize);
        if (!oldParsed || !newParsed) {
            resultDiv.innerHTML = '<i data-lucide="alert-circle"></i> Неверный формат. Используйте: Ширина/ПрофильRДиаметр (205/55R16)';
            App.initIcons();
            return;
        }
        var oldDiameter = App.ui.pages.calculateTireDiameter(oldParsed.width, oldParsed.aspect, oldParsed.diameter);
        var newDiameter = App.ui.pages.calculateTireDiameter(newParsed.width, newParsed.aspect, newParsed.diameter);
        var diffPercent = ((newDiameter - oldDiameter) / oldDiameter) * 100;
        var recommendation = Math.abs(diffPercent) > 2.5
            ? '<i data-lucide="alert-triangle"></i> Отклонение более 2.5% — не рекомендуется, спидометр будет врать.'
            : '<i data-lucide="check-circle"></i> Отклонение в пределах нормы (до 2.5%).';
        resultDiv.innerHTML =
            '<i data-lucide="ruler"></i> Диаметр старой шины: ' + oldDiameter.toFixed(1) + ' мм<br>' +
            '<i data-lucide="ruler"></i> Диаметр новой шины: ' + newDiameter.toFixed(1) + ' мм<br>' +
            '<i data-lucide="bar-chart-2"></i> Разница: ' + diffPercent.toFixed(2) + '%<br>' +
            '<i data-lucide="car"></i> При реальной скорости 100 км/ч спидометр будет показывать ' + (100 / (1 + diffPercent/100)).toFixed(1) + ' км/ч<br>' +
            recommendation;
        App.initIcons();
    });
};

App.ui.pages.openTireModal = function(record) {
    var isEdit = !!record && !!record.id;
    var defaultDate = record ? App.utils.isoToDDMMYYYY(record.date) : App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);
    var typeValue = record ? (record.type || 'Лето') : 'Лето';
    var isNewSet = record ? (record.mileage === 0 && record.purchaseCost) : false;

    var content =
        '<form id="tire-form">' +
            (isEdit ? '<input type="hidden" name="id" value="' + record.id + '">' : '') +
            '<label>Дата (ДД-ММ-ГГГГ)</label>' +
            '<input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + App.utils.escapeHtml(defaultDate) + '">' +
            '<label>Тип</label>' +
            '<select name="type">' +
                '<option value="Лето" ' + (typeValue === 'Лето' ? 'selected' : '') + '>Лето</option>' +
                '<option value="Зима" ' + (typeValue === 'Зима' ? 'selected' : '') + '>Зима</option>' +
            '</select>' +
            '<label><input type="checkbox" name="isNewSet" id="isNewSetCheckbox" ' + (isNewSet ? 'checked' : '') + '> Новый комплект</label>' +
            '<div id="newSetFields" style="display:' + (isNewSet ? 'block' : 'none') + ';">' +
                '<label>Название модели</label><input type="text" name="model" value="' + App.utils.escapeHtml(record ? (record.model || '') : '') + '">' +
                '<label>Размерность</label><input type="text" name="size" value="' + App.utils.escapeHtml(record ? (record.size || '') : '') + '">' +
                '<label>Стоимость покупки (₽)</label><input type="number" name="purchaseCost" step="0.01" value="' + (record ? (record.purchaseCost || '') : '') + '">' +
            '</div>' +
            '<div id="mountFields" style="display:' + (isNewSet ? 'none' : 'block') + ';">' +
                '<label>Текущий пробег (км)</label><input type="number" name="currentMileage" value="' + (isNewSet ? 0 : App.store.settings.currentMileage) + '" required>' +
                '<label>Стоимость шиномонтажа (₽)</label><input type="number" name="mountCost" step="0.01" value="' + (record ? (record.mountCost || '') : '') + '">' +
                '<label><input type="checkbox" name="isDIY" value="true" ' + (record && record.isDIY ? 'checked' : '') + '> Сделал сам</label>' +
            '</div>' +
            '<label>Износ / Остаток шипов (' + (typeValue === 'Зима' ? '%' : 'мм') + ')</label>' +
            '<input type="number" name="wear" step="0.1" value="' + (record ? (record.wear || '') : '') + '">' +
            '<label>Примечание</label>' +
            '<input type="text" name="notes" value="' + App.utils.escapeHtml(record ? (record.notes || '') : '') + '">' +
            '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '✏️ Редактировать запись шин' : '🛞 Сменить резину', content);

    modal.querySelector('#isNewSetCheckbox').addEventListener('change', function(e) {
        modal.querySelector('#newSetFields').style.display = e.target.checked ? 'block' : 'none';
        modal.querySelector('#mountFields').style.display = e.target.checked ? 'none' : 'block';
    });

    var form = modal.querySelector('#tire-form');
    form.onsubmit = function(e) {
        e.preventDefault();
        var formEl = e.target;
        var d = Object.fromEntries(new FormData(formEl));
        var isNew = d.isNewSet === 'on';
        var currentMileage = isNew ? 0 : App.utils.validateNumberInput(formEl.querySelector('[name="currentMileage"]'), false);
        if (!isNew && currentMileage === null) return;

        var mountCost = App.utils.validateNumberInput(formEl.querySelector('[name="mountCost"]'), true, true);
        var purchaseCost = App.utils.validateNumberInput(formEl.querySelector('[name="purchaseCost"]'), true, true);

        var dateISO = App.utils.ddmmYYYYtoISO(d.date);
        modal.remove();

        var existingUuid = (record && record.uuid) ? record.uuid : crypto.randomUUID();
        var existingUpdatedAt = (record && record.updated_at) ? record.updated_at : new Date().toISOString();

        var rowData = {
            id: d.id || null,
            uuid: existingUuid,
            updated_at: existingUpdatedAt,
            date: dateISO,
            type: d.type,
            mileage: currentMileage,
            model: d.model || '',
            size: d.size || '',
            wear: d.wear || '',
            notes: d.notes || '',
            purchaseCost: isNew ? (purchaseCost || 0) : 0,
            mountCost: isNew ? 0 : (mountCost || 0),
            isDIY: d.isDIY === 'true'
        };

        if (App.config.USE_SUPABASE) {
            App.storage.saveTireRecord(d.id, rowData)
                .then(function(res) {
                    if (res && res.data && res.data.length > 0) {
                        rowData.id = res.data[0].id;
                    }
                    if (isEdit) {
                        var idx = App.store.tireLog.findIndex(function(t) { return t.id == d.id; });
                        if (idx !== -1) App.store.tireLog[idx] = rowData;
                    } else {
                        App.store.tireLog.push(rowData);
                    }
                    App.store.saveToLocalStorage();
                    App.ui.pages.renderTiresTable();
                    App.toast(isEdit ? 'Запись о шинах обновлена' : 'Резина добавлена', 'success');
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка сохранения в Supabase', 'error');
                });
        } else {
            // Старая логика...
            if (App.auth.accessToken) {
                if (isEdit) {
                    App.storage.saveTireRecord(d.id, rowData);
                } else {
                    App.storage.addTireRecord(rowData);
                }
            }
            var idx = App.store.tireLog.findIndex(function(t) { return t.id == d.id; });
            if (idx !== -1) {
                App.store.tireLog[idx] = rowData;
            } else if (!isEdit) {
                App.store.tireLog.push(rowData);
            }
            App.store.saveToLocalStorage();
            App.ui.pages.renderTiresTable();
            if (App.auth.accessToken) App.loadSheet();
            App.toast(isEdit ? 'Запись о шинах обновлена' : 'Резина добавлена', 'success');
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.deleteTireEntry = function(idx) {
    var tire = App.store.tireLog[idx];
    if (!tire || !tire.id) { App.toast('Запись не найдена', 'error'); return; }
    App.storage.deleteTireRecord(tire.id).then(function() {
        App.storage.loadAllData();
        App.toast('Запись о шинах удалена', 'success');
    }).catch(function(err) {
        console.error(err);
        App.toast('Не удалось удалить запись (недостаточно прав)', 'error');
    });
};