// src/state/store.js
window.App = window.App || {};

App.store = {
    spreadsheetId: '',

    operations: [],
    parts: [],
    fuelLog: [],
    tireLog: [],
    workCosts: [],
    serviceRecords: [],
    mileageHistory: [],

    cars: [],
    activeCarId: null,

    settings: {
        currentMileage: 0,
        currentMotohours: 0,
        avgDailyMileage: 45,
        avgDailyMotohours: 1.8,
        telegramToken: '',
        telegramChatId: '',
        notificationMethod: 'telegram'
    },

    baseMileage: 0,
    baseMotohours: 0,
    purchaseDate: '',

    ownershipDays: 0,
    ownershipDisplayMode: 'days',

    pendingActions: [],
    calendarEventCache: new Map(),

    serverTimestamps: {},

    initFromLocalStorage: function() {
    return App.indexedDB.loadAllData().then((function(data) {
        if (data) {
            // Основные массивы
            this.operations = data.operations || [];
            this.parts = data.parts || [];
            this.fuelLog = data.fuelLog || [];
            this.tireLog = data.tireLog || [];
            this.workCosts = data.workCosts || [];
            this.serviceRecords = data.serviceRecords || [];
            this.mileageHistory = data.mileageHistory || [];
            this.cars = data.cars || [];
            this.activeCarId = data.activeCarId || null;

            // Настройки и дополнительные поля
            this.settings = data.settings || this.settings;
            this.baseMileage = data.baseMileage || 0;
            this.baseMotohours = data.baseMotohours || 0;
            this.purchaseDate = data.purchaseDate || '';
            this.ownershipDays = data.ownershipDays || 0;
            this.ownershipDisplayMode = data.ownershipDisplayMode || 'days';
            this.spreadsheetId = data.spreadsheetId || '';
            this.pendingActions = data.pendingActions || [];

            // Несериализуемые поля сбрасываем
            this.calendarEventCache = new Map();
            this.serverTimestamps = {};
        }

        // Миграция из старого localStorage (однократно)
        var oldData = localStorage.getItem(App.config.CACHE_KEY);
        if (oldData && !localStorage.getItem('indexedDB_migrated')) {
            try {
                var parsed = JSON.parse(oldData);
                if (parsed) {
                    this.operations = parsed.operations || this.operations;
                    this.parts = parsed.parts || this.parts;
                    this.fuelLog = parsed.fuelLog || this.fuelLog;
                    this.tireLog = parsed.tireLog || this.tireLog;
                    this.workCosts = parsed.workCosts || this.workCosts;
                    this.serviceRecords = parsed.serviceRecords || this.serviceRecords;
                    this.mileageHistory = parsed.mileageHistory || this.mileageHistory;
                    if (parsed.settings) Object.assign(this.settings, parsed.settings);
                    this.baseMileage = parsed.baseMileage || this.baseMileage;
                    this.baseMotohours = parsed.baseMotohours || this.baseMotohours;
                    this.purchaseDate = parsed.purchaseDate || this.purchaseDate;
                    this.ownershipDays = parsed.ownershipDays || this.ownershipDays;
                    this.ownershipDisplayMode = parsed.ownershipDisplayMode || this.ownershipDisplayMode;
                    this.spreadsheetId = parsed.spreadsheetId || this.spreadsheetId;
                    this.pendingActions = parsed.pendingActions || this.pendingActions;
                }
            } catch(e) { console.warn('Migration error:', e); }
            // Сохраняем мигрированные данные в IndexedDB и удаляем старый ключ
            this.saveToLocalStorage();
            localStorage.removeItem(App.config.CACHE_KEY);
            localStorage.setItem('indexedDB_migrated', '1');
        }
        return data;
    }).bind(this)).catch((function(err) {
        console.warn('IndexedDB load error, using defaults:', err);
    }).bind(this));
},

saveToLocalStorage: function() {
    var data = {
        operations: this.operations,
        parts: this.parts,
        fuelLog: this.fuelLog,
        tireLog: this.tireLog,
        workCosts: this.workCosts,
        serviceRecords: this.serviceRecords,
        mileageHistory: this.mileageHistory,
        cars: this.cars,
        activeCarId: this.activeCarId,
        settings: this.settings,
        baseMileage: this.baseMileage,
        baseMotohours: this.baseMotohours,
        purchaseDate: this.purchaseDate,
        ownershipDays: this.ownershipDays,
        ownershipDisplayMode: this.ownershipDisplayMode,
        spreadsheetId: this.spreadsheetId,
        pendingActions: this.pendingActions
    };
    App.indexedDB.saveAllData(data).catch(function(err) {
        console.error('IndexedDB save error:', err);
    });
},

    saveServerTimestamps: function() {
        localStorage.setItem('vesta_server_timestamps', JSON.stringify(this.serverTimestamps));
    },

    hasConflict: function(entityType, uuid, localUpdatedAt) {
        var key = entityType + ':' + uuid;
        var serverTime = this.serverTimestamps[key];
        if (!serverTime || !localUpdatedAt) return false;
        return new Date(serverTime) > new Date(localUpdatedAt);
    },

    updateServerTimestamp: function(entityType, uuid, newTimestamp) {
        var key = entityType + ':' + uuid;
        this.serverTimestamps[key] = newTimestamp || new Date().toISOString();
        this.saveServerTimestamps();
    },

    addPendingAction: function(action) {
        this.pendingActions.push(action);
        localStorage.setItem(App.config.PENDING_KEY, JSON.stringify(this.pendingActions));
    },

    clearPendingActions: function() {
        this.pendingActions = [];
        localStorage.removeItem(App.config.PENDING_KEY);
    },

    loadPriceHistory: function() {
        var stored = localStorage.getItem(App.config.PRICE_HISTORY_KEY);
        if (!stored) return;
        var historyData = JSON.parse(stored);
        var parts = this.parts;
        for (var i = 0; i < parts.length; i++) {
            if (historyData[parts[i].id]) {
                parts[i].priceHistory = historyData[parts[i].id];
            }
        }
    },

    savePriceHistory: function() {
        var historyData = {};
        var parts = this.parts;
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].priceHistory && parts[i].priceHistory.length) {
                historyData[parts[i].id] = parts[i].priceHistory;
            }
        }
        localStorage.setItem(App.config.PRICE_HISTORY_KEY, JSON.stringify(historyData));
    },

    calculateOwnershipDays: function() {
        if (!this.purchaseDate) {
            this.ownershipDays = 0;
            return;
        }
        var now = new Date();
        var purchase = new Date(this.purchaseDate);
        if (isNaN(purchase.getTime())) {
            this.ownershipDays = 0;
            return;
        }
        var diffTime = Math.abs(now.getTime() - purchase.getTime());
        this.ownershipDays = Math.floor(diffTime / 86400000);
    },

    saveCalendarCache: function() {
        var entries = Array.from(this.calendarEventCache.entries());
        localStorage.setItem(App.config.CALENDAR_CACHE_KEY, JSON.stringify(entries));
    },

    // ---------- Мульти-авто ----------
    setActiveCar: function(carId) {
        this.activeCarId = carId;
        localStorage.setItem('vesta_active_car_id', carId);
    },

    loadCars: function() {
        var self = this;
        return App.supa.loadCars().then(function(cars) {
            self.cars = cars;
            if (cars.length > 0 && !self.activeCarId) {
                self.setActiveCar(cars[0].id);
            }
            return cars;
        });
    }
};
