// src/ui/pages/history.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.populateHistoryOperationFilter = function() {
    var select = document.getElementById('history-operation-filter');
    if (!select) return;
    var currentValue = select.value;
    select.innerHTML = '<option value="">Все операции</option>';

    var seen = new Map();
    App.store.operations.forEach(function(op) {
        if (!seen.has(op.name)) {
            seen.set(op.name, { name: op.name, category: op.category });
        }
    });
    var uniqueOps = Array.from(seen.values()).sort(function(a, b) { return a.name.localeCompare(b.name); });
    uniqueOps.forEach(function(op) {
        var option = document.createElement('option');
        option.value = op.name;
        option.textContent = op.name + ' (' + op.category + ')';
        select.appendChild(option);
    });
    if (currentValue) select.value = currentValue;
};

App.ui.pages.getFilteredHistory = function() {
    var period = document.getElementById('history-period-select')?.value || 'all';
    var opFilter = document.getElementById('history-operation-filter')?.value || '';
    var searchText = (document.getElementById('history-search')?.value || '').toLowerCase();
    var diyOnly = document.getElementById('history-diy-only')?.checked || false;
    var costMin = parseFloat(document.getElementById('history-cost-min')?.value) || 0;
    var costMax = parseFloat(document.getElementById('history-cost-max')?.value) || Infinity;

    var filtered = App.store.serviceRecords.slice();

    if (period !== 'all') {
        var startDate = App.logic.getStartDateForPeriod(period);
        if (startDate) {
            filtered = filtered.filter(function(r) {
                var d = r.date ? new Date(r.date) : null;
                return d && d >= startDate;
            });
        }
    }

    if (opFilter) {
        filtered = filtered.filter(function(r) {
            var op = App.store.operations.find(function(o) { return o.id == r.operation_id; });
            return op && op.name === opFilter;
        });
    }

    if (searchText) {
        filtered = filtered.filter(function(r) {
            var op = App.store.operations.find(function(o) { return o.id == r.operation_id; });
            var opName = op ? op.name.toLowerCase() : '';
            var notes = (r.notes || '').toLowerCase();
            return opName.indexOf(searchText) !== -1 || notes.indexOf(searchText) !== -1;
        });
    }

    if (diyOnly) {
        filtered = filtered.filter(function(r) { return r.is_diy === true || r.is_diy === 'TRUE'; });
    }

    filtered = filtered.filter(function(r) {
        var cost = (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
        return cost >= costMin && cost <= costMax;
    });

    return filtered;
};

App.ui.pages.renderHistoryWithFilters = function() {
    var tbody = document.getElementById('history-body');
    if (!tbody) return;
    var filtered = App.ui.pages.getFilteredHistory();
    tbody.innerHTML = '';

    filtered.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); }).forEach(function(record) {
        var tr = document.createElement('tr');
        var op = App.store.operations.find(function(o) { return o.id == record.operation_id; }) || { name: 'Неизвестно' };
        var diyFlag = record.is_diy === 'TRUE' || record.is_diy === true;
        var userIdShort = record.user_id ? record.user_id.substring(0, 8) : '—';
        tr.innerHTML =
            '<td>' + (record.date || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(op.name) + '</td>' +
            '<td>' + (record.mileage || '') + '</td>' +
            '<td>' + (record.motohours || '') + '</td>' +
            '<td>' + (record.parts_cost || '') + '</td>' +
            '<td>' + (record.work_cost || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(record.notes || '') + '</td>' +
            '<td style="text-align:center;">' + (diyFlag ? '<i data-lucide="check"></i>' : '—') + '</td>' +
            '<td>' + userIdShort + '</td>' +   // новая колонка "Исполнитель"
            '<td>' +
                '<button class="icon-btn" data-action="edit-history" data-row="' + record.rowIndex + '"><i data-lucide="pencil"></i></button>' +
                '<button class="icon-btn" data-action="delete-history" data-row="' + record.rowIndex + '"><i data-lucide="trash-2"></i></button>' +
            '</td>';
        tbody.appendChild(tr);
    });
    App.initIcons();
};

App.ui.pages.openHistoryEdit = function(rowIndex) {
    var record = App.store.serviceRecords.find(function(r) { return r.rowIndex == rowIndex; });
    if (!record) return;

    var content =
        '<form id="history-edit-form">' +
            '<input type="hidden" name="rowIndex" value="' + rowIndex + '">' +
            '<label>Дата (ГГГГ-ММ-ДД)</label>' +
            '<input type="text" name="date" value="' + (record.date || '') + '" placeholder="ГГГГ-ММ-ДД" pattern="\\d{4}-\\d{2}-\\d{2}" required oninput="App.utils.applyDateMaskISO(event)">' +
            '<label>Пробег, км</label><input type="number" name="mileage" value="' + (record.mileage || '') + '">' +
            '<label>Моточасы</label><input type="text" name="motohours" value="' + (record.motohours || '') + '">' +
            '<label>Запчасти, ₽</label><input type="number" name="partsCost" value="' + (record.parts_cost || '') + '" step="0.01">' +
            '<label>Работа, ₽</label><input type="number" name="workCost" value="' + (record.work_cost || '') + '" step="0.01">' +
            '<label><input type="checkbox" name="isDIY" value="true" ' + (record.is_diy === true || record.is_diy === 'TRUE' ? 'checked' : '') + '> Сделал сам</label>' +
            '<label>Примечание</label><input type="text" name="notes" value="' + App.utils.escapeHtml(record.notes || '') + '">' +
            '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal('✏️ Редактировать запись истории', content);
    var form = modal.querySelector('#history-edit-form');
    form.onsubmit = function(ev) {
        ev.preventDefault();
        var formEl = ev.target;
        var mileage = App.utils.validateNumberInput(formEl.querySelector('[name="mileage"]'), false);
        var partsCost = App.utils.validateNumberInput(formEl.querySelector('[name="partsCost"]'), true, true);
        var workCost = App.utils.validateNumberInput(formEl.querySelector('[name="workCost"]'), true, true);
        if (mileage === null) return;

        var data = new FormData(formEl);
        var newValues = {
            id: record.id,
            uuid: record.uuid,
            operation_id: record.operation_id,
            date: data.get('date'),
            mileage: mileage,
            motohours: data.get('motohours'),
            parts_cost: partsCost,
            work_cost: workCost,
            is_diy: data.get('isDIY') === 'true',
            notes: data.get('notes'),
            photo_url: record.photo_url,
            timestamp: new Date().toISOString()
        };
        modal.remove();
        App.storage.updateHistoryRecord(rowIndex, newValues).then(function() {
            return App.storage.loadAllData();
        }).then(function() {
            App.toast('Запись истории обновлена', 'success');
        }).catch(function(e) {
            console.error('Ошибка сохранения:', e);
            App.toast('Не удалось сохранить', 'error');
        });
    };
    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.deleteHistoryEntry = function(rowIndex) {
    App.storage.deleteHistoryRecord(rowIndex).then(function() {
        App.storage.loadAllData();
        App.toast('Запись удалена', 'success');
    }).catch(function(err) {
        console.error(err);
        App.toast('Не удалось удалить запись (недостаточно прав)', 'error');
    });
};