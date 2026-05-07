// src/api/storage.js
window.App = window.App || {};
App.storage = App.storage || {};

function checkResponse({ data, error }, actionName) {
    if (error) throw error;
    if (data && Array.isArray(data) && data.length === 0 && actionName === 'delete') {
        throw new Error('Нет прав на удаление');
    }
}

App.storage.saveOperation = function(op) {
    return App.supa.saveOperation(op).then(function(res) { checkResponse(res, 'save'); });
};

App.storage.deleteOperation = function(operationId) {
    if (!App.supabase) return Promise.reject(new Error('Supabase client not initialized'));
    return App.supabase.from('operations').delete().eq('id', operationId).select()
        .then(function(res) { checkResponse(res, 'delete'); });
};

App.storage.addHistoryRecord = function(rec) {
    return App.supa.saveHistoryRecord(rec).then(function(res) { checkResponse(res, 'save'); });
};

App.storage.updateHistoryRecord = function(rowIndex, record) {
    return App.supa.saveHistoryRecord(record).then(function(res) { checkResponse(res, 'save'); });
};

App.storage.deleteHistoryRecord = function(rowIndex) {
    return App.supabase.from('history').delete().eq('id', rowIndex).select()
        .then(function(res) { checkResponse(res, 'delete'); });
};

App.storage.savePart = function(part) {
    return App.supa.savePart(part).then(function(res) { checkResponse(res, 'save'); });
};

App.storage.deletePart = function(partId) {
    return App.supabase.from('parts').delete().eq('id', partId).select()
        .then(function(res) { checkResponse(res, 'delete'); });
};

App.storage.saveFuelRecord = function(id, record) {
    return App.supa.saveFuelRecord(record).then(function(res) { checkResponse(res, 'save'); });
};

App.storage.deleteFuelRecord = function(id) {
    return App.supabase.from('fuel_log').delete().eq('id', id).select()
        .then(function(res) { checkResponse(res, 'delete'); });
};

App.storage.saveTireRecord = function(id, record) {
    return App.supa.saveTireRecord(record).then(function(res) { checkResponse(res, 'save'); });
};

App.storage.deleteTireRecord = function(id) {
    return App.supabase.from('tires').delete().eq('id', id).select()
        .then(function(res) { checkResponse(res, 'delete'); });
};

App.storage.addMileageRecord = function(date, mileage, motohours) {
    return App.supa.getCurrentUserId().then(function(userId) {
        return App.supabase.from('mileage_log').insert({
            date: date,
            mileage: mileage,
            motohours: motohours,
            user_id: userId
        }).then(function(res) { checkResponse(res, 'save'); });
    });
};

// Сохранение настроек: общие показатели + персональные уведомления
App.storage.saveSettings = function(settings) {
    var vehiclePromise = App.supa.saveVehicleState({
        currentMileage: settings.currentMileage,
        currentMotohours: settings.currentMotohours,
        avgDailyMileage: settings.avgDailyMileage,
        avgDailyMotohours: settings.avgDailyMotohours
    }).then(function(res) { checkResponse(res, 'save'); });
    
    var userPromise = App.supa.saveUserSettings({
        telegramToken: settings.telegramToken,
        telegramChatId: settings.telegramChatId,
        notificationMethod: settings.notificationMethod,
        reminderDays: settings.reminderDays || '7,2'
    }).then(function(res) { checkResponse(res, 'save'); });
    
    return Promise.all([vehiclePromise, userPromise]);
};

App.storage.loadAllData = function() {
    return Promise.all([
        App.supa.loadOperations(),
        App.supa.loadFuelLog(),
        App.supa.loadTires(),
        App.supa.loadParts(),
        App.supa.loadHistory(),
        App.supa.loadSettings(),
        App.supa.loadMileageHistory()
    ]).then(([operations, fuelLog, tireLog, parts, history, settings, mileageHistory]) => {
        App.store.operations = operations;
        App.store.fuelLog = fuelLog;
        App.store.tireLog = tireLog;
        App.store.parts = parts;
        App.store.serviceRecords = history;
        if (settings) Object.assign(App.store.settings, settings);
        App.store.mileageHistory = mileageHistory;
        App.store.saveToLocalStorage();
        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.renderAll === 'function') App.renderAll();
        App.setSyncStatus('synced');
    }).catch(function(e) {
        console.error(e);
        App.toast('Ошибка загрузки данных', 'error');
    });
};
