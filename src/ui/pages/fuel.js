// src/ui/pages/fuel.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.renderFuelTable = function() {
    var tbody = document.getElementById('fuel-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    App.store.fuelLog.forEach(function(f, i) {
        if (!f.date) return;
        var tr = document.createElement('tr');
        var fullTankIcon = (f.fullTank === 'TRUE' || f.fullTank === true) ? '<i data-lucide="check"></i>' : '';
        tr.innerHTML =
            '<td>' + App.utils.escapeHtml(f.date) + '</td>' +
            '<td>' + (f.mileage || '') + '</td>' +
            '<td>' + (f.liters || '') + '</td>' +
            '<td>' + (f.pricePerLiter || '') + '</td>' +
            '<td style="text-align:center;">' + fullTankIcon + '</td>' +
            '<td>' + App.utils.escapeHtml(f.fuelType || '') + '</td>' +
            '<td>' + App.utils.escapeHtml(f.notes || '') + '</td>' +
            '<td>' +
                '<button class="icon-btn" data-action="edit-fuel" data-idx="' + i + '"><i data-lucide="pencil"></i></button>' +
                '<button class="icon-btn" data-action="delete-fuel" data-idx="' + i + '"><i data-lucide="trash-2"></i></button>' +
            '</td>';
        tbody.appendChild(tr);
    });
    App.initIcons();
};

App.ui.pages.checkFuelOrderConflicts = function(dateISO, mileage, excludeRowIndex) {
    var sorted = App.store.fuelLog.filter(function(_, idx) {
        return (idx + 2) !== excludeRowIndex;
    }).sort(function(a, b) {
        if (a.date === b.date) return a.mileage - b.mileage;
        return (a.date || '').localeCompare(b.date || '');
    });

    var prev = null, next = null;
    for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i];
        if (!r.date) continue;
        if (r.date < dateISO) {
            prev = r;
        } else if (r.date === dateISO && r.mileage <= mileage) {
            prev = r;
        } else {
            next = r;
            break;
        }
    }

    var conflict = false;
    var message = '';
    if (prev && prev.mileage > mileage) {
        conflict = true;
        message += '⚠️ Пробег (' + mileage + ' км) меньше предыдущей заправки от ' + prev.date + ' (' + prev.mileage + ' км). ';
    }
    if (next && next.mileage < mileage) {
        conflict = true;
        message += '⚠️ Пробег (' + mileage + ' км) больше следующей заправки от ' + next.date + ' (' + next.mileage + ' км). ';
    }
    if (prev && prev.date > dateISO) {
        conflict = true;
        message += '⚠️ Дата (' + dateISO + ') раньше предыдущей заправки от ' + prev.date + '. ';
    }
    if (next && next.date < dateISO) {
        conflict = true;
        message += '⚠️ Дата (' + dateISO + ') позже следующей заправки от ' + next.date + '. ';
    }
    return { hasConflict: conflict, message: message, prevRecord: prev, nextRecord: next };
};

App.ui.pages.openFuelModal = function(record) {
    var isEdit = !!(record && record.id);
    var defaultDate = record && record.date
        ? App.utils.isoToDDMMYYYY(record.date)
        : App.utils.isoToDDMMYYYY(new Date().toISOString().split('T')[0]);
    var currentMileage = App.store.settings.currentMileage;

    var content =
        '<form id="fuel-form">' +
            (isEdit ? '<input type="hidden" name="id" value="' + record.id + '">' : '') +
            '<label>Дата (ДД-ММ-ГГГГ)</label>' +
            '<input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="App.utils.applyDateMaskDDMMYYYY(event)" value="' + App.utils.escapeHtml(defaultDate) + '">' +
            '<label>Пробег</label>' +
            '<input type="number" name="mileage" value="' + (record ? record.mileage : currentMileage) + '" required>' +
            '<label>Литры</label>' +
            '<input type="number" name="liters" step="0.01" value="' + (record ? record.liters : '') + '" required>' +
            '<label>Цена/л</label>' +
            '<input type="number" name="pricePerLiter" step="0.01" value="' + (record ? record.pricePerLiter : '') + '">' +
            '<label>Полный бак? <input type="checkbox" name="fullTank" value="true" ' + (record && record.fullTank ? 'checked' : '') + '></label>' +
            '<label>Тип топлива</label>' +
            '<select name="fuelType">' +
                '<option value="Бензин" ' + (record && record.fuelType === 'Бензин' ? 'selected' : '') + '>Бензин</option>' +
                '<option value="Дизель" ' + (record && record.fuelType === 'Дизель' ? 'selected' : '') + '>Дизель</option>' +
                '<option value="Газ (ГБО)" ' + (record && record.fuelType === 'Газ (ГБО)' ? 'selected' : '') + '>Газ (ГБО)</option>' +
                '<option value="Электричество" ' + (record && record.fuelType === 'Электричество' ? 'selected' : '') + '>Электричество</option>' +
            '</select>' +
            '<label>Примечание</label>' +
            '<input type="text" name="notes" value="' + App.utils.escapeHtml(record ? (record.notes || '') : '') + '">' +
            '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '✏️ Редактировать заправку' : '⛽ Добавить заправку', content);
    var form = modal.querySelector('#fuel-form');

    form.onsubmit = function(e) {
        e.preventDefault();
        var formEl = e.target;
        var dateStr = formEl.querySelector('[name="date"]').value.trim();
        var dateISO = App.utils.ddmmYYYYtoISO(dateStr);
        var mileage = App.utils.validateNumberInput(formEl.querySelector('[name="mileage"]'), false);
        var liters = App.utils.validateNumberInput(formEl.querySelector('[name="liters"]'), true);
        var pricePerLiter = App.utils.validateNumberInput(formEl.querySelector('[name="pricePerLiter"]'), true, true);
        if (mileage === null || liters === null) return;

        var d = Object.fromEntries(new FormData(formEl));
        var id = d.id || null;
        var conflict = App.ui.pages.checkFuelOrderConflicts(dateISO, mileage, id ? null : null);
        if (conflict.hasConflict) {
            if (!confirm(conflict.message + '\n\nСохранить, несмотря на нарушение порядка?')) {
                return;
            }
        }

        modal.remove();

        var existingUuid = (record && record.uuid) ? record.uuid : crypto.randomUUID();
        var existingUpdatedAt = (record && record.updated_at) ? record.updated_at : new Date().toISOString();

        var recordData = {
            id: id,
            uuid: existingUuid,
            updated_at: existingUpdatedAt,
            date: dateISO,
            mileage: mileage,
            liters: liters,
            pricePerLiter: pricePerLiter,
            fullTank: d.fullTank || '',
            fuelType: d.fuelType,
            notes: d.notes || ''
        };

        // Сохранение
        if (App.config.USE_SUPABASE) {
            App.storage.saveFuelRecord(id, recordData)
                .then(function(res) {
                    // Получаем новый UUID после вставки
                    if (res && res.data && res.data.length > 0) {
                        recordData.id = res.data[0].id;
                    }
                    if (isEdit) {
                        var idx = App.store.fuelLog.findIndex(function(f) { return f.id == id; });
                        if (idx !== -1) App.store.fuelLog[idx] = recordData;
                    } else {
                        App.store.fuelLog.push(recordData);
                    }
                    App.store.saveToLocalStorage();
                    App.ui.pages.renderFuelTable();
                    App.toast(isEdit ? 'Заправка обновлена' : 'Заправка добавлена', 'success');
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка сохранения в Supabase', 'error');
                });
        } else {
            // Старая логика (Google или локально)
            if (App.auth.accessToken) {
                if (isEdit) {
                    App.storage.saveFuelRecord(id, recordData);
                } else {
                    App.storage.addFuelRecord(recordData);
                }
            }
            var idx = App.store.fuelLog.findIndex(function(f) { return f.id == id; });
            if (idx !== -1) {
                App.store.fuelLog[idx] = recordData;
            } else if (!isEdit) {
                App.store.fuelLog.push(recordData);
            }
            App.store.saveToLocalStorage();
            App.ui.pages.renderFuelTable();
            if (App.auth.accessToken) {
                App.loadSheet();
            }
            App.toast(isEdit ? 'Заправка обновлена' : 'Заправка добавлена', 'success');
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.deleteFuelEntry = function(idx) {
    var fuel = App.store.fuelLog[idx];
    if (!fuel || !fuel.id) { App.toast('Запись не найдена', 'error'); return; }
    App.storage.deleteFuelRecord(fuel.id).then(function() {
        App.storage.loadAllData();
        App.toast('Запись о заправке удалена', 'success');
    }).catch(function(err) {
        console.error(err);
        App.toast('Не удалось удалить заправку (возможно, недостаточно прав)', 'error');
    });
};

App.ui.pages.startVoiceFuelInput = function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert('Распознавание речи не поддерживается в этом браузере');
        return;
    }
    var rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    var voiceBtn = document.getElementById('voice-fuel-btn');
    if (voiceBtn) voiceBtn.classList.add('recording');
    rec.start();
    rec.onresult = function(e) {
        var text = e.results[0][0].transcript;
        App.ui.pages.parseFuelVoice(text);
        if (voiceBtn) voiceBtn.classList.remove('recording');
    };
    rec.onerror = function(e) {
        if (voiceBtn) voiceBtn.classList.remove('recording');
        alert(e.error === 'not-allowed' ? 'Доступ к микрофону запрещён.' : 'Ошибка распознавания: ' + e.error);
    };
};

App.ui.pages.parseFuelVoice = function(text) {
    var nums = text.match(/\d+(?:[.,]\d+)?/g);
    if (!nums || nums.length < 2) {
        alert('Скажите пробег и литры. Например: "пробег двенадцать тысяч литров сорок два"');
        return;
    }
    var mileage = parseInt(nums[0]);
    var liters = parseFloat(nums[1].replace(',', '.'));
    var pricePerLiter = nums[2] ? parseFloat(nums[2].replace(',', '.')) : null;
    App.ui.pages.openFuelModal({ mileage: mileage, liters: liters, pricePerLiter: pricePerLiter });
};