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
    var self = this;
    return App.indexedDB.loadAllData().then(function(data) {
        if (data) {
            self.operations = data.operations || [];
            self.settings = data.settings || App.defaults.settings;
            self.parts = data.parts || [];
            self.fuelLog = data.fuelLog || [];
            self.tireLog = data.tireLog || [];
            self.workCosts = data.workCosts || [];
            self.serviceRecords = data.serviceRecords || [];
            self.mileageHistory = data.mileageHistory || [];
            self.cars = data.cars || [];
            self.activeCarId = data.activeCarId || null;
            self.baseMileage = data.baseMileage || 0;
            self.baseMotohours = data.baseMotohours || 0;
            self.purchaseDate = data.purchaseDate || '';
            self.ownershipDays = data.ownershipDays || 0;
            self.ownershipDisplayMode = data.ownershipDisplayMode || 'days';
            self.spreadsheetId = data.spreadsheetId || '';
            self.pendingActions = data.pendingActions || [];
            // Несериализуемые объекты
            self.calendarEventCache = new Map();
            self.serverTimestamps = {};
        }

        // Миграция из старого localStorage (однократно)
        var oldData = localStorage.getItem(App.config.CACHE_KEY);
        if (oldData && !localStorage.getItem('indexedDB_migrated')) {
            try {
                var parsed = JSON.parse(oldData);
                if (parsed) {
                    self.operations = parsed.operations || self.operations;
                    self.settings = parsed.settings || self.settings;
                    self.parts = parsed.parts || self.parts;
                    self.fuelLog = parsed.fuelLog || self.fuelLog;
                    self.tireLog = parsed.tireLog || self.tireLog;
                    self.workCosts = parsed.workCosts || self.workCosts;
                    self.serviceRecords = parsed.serviceRecords || self.serviceRecords;
                    self.mileageHistory = parsed.mileageHistory || self.mileageHistory;
                    self.baseMileage = parsed.baseMileage || self.baseMileage;
                    self.baseMotohours = parsed.baseMotohours || self.baseMotohours;
                    self.purchaseDate = parsed.purchaseDate || self.purchaseDate;
                    self.ownershipDays = parsed.ownershipDays || self.ownershipDays;
                    self.ownershipDisplayMode = parsed.ownershipDisplayMode || self.ownershipDisplayMode;
                    self.spreadsheetId = parsed.spreadsheetId || self.spreadsheetId;
                    self.pendingActions = parsed.pendingActions || self.pendingActions;
                }
            } catch(e) { console.warn('Migration error:', e); }
            // Сохраняем в IndexedDB и удаляем старый ключ
            self.saveToLocalStorage();
            localStorage.removeItem(App.config.CACHE_KEY);
            localStorage.setItem('indexedDB_migrated', '1');
        }

        // Загружаем остатки из localStorage (pending, calendar, price history и т.д.)
        var pendingRaw = localStorage.getItem(App.config.PENDING_KEY);
        self.pendingActions = pendingRaw ? JSON.parse(pendingRaw) : self.pendingActions;

        try {
            var calRaw = localStorage.getItem(App.config.CALENDAR_CACHE_KEY);
            if (calRaw) {
                var entries = JSON.parse(calRaw);
                self.calendarEventCache = new Map(entries);
            }
        } catch (e) {}

        var notifMethod = localStorage.getItem(App.config.NOTIFICATION_METHOD_KEY);
        if (notifMethod) {
            self.settings.notificationMethod = notifMethod;
        }
        self.loadPriceHistory();
        self.activeCarId = localStorage.getItem('vesta_active_car_id') || self.activeCarId;
        self.calculateOwnershipDays();

        return data;
    }).catch(function(err) {
        console.warn('IndexedDB load error, using defaults:', err);
        // Fallback к значениям по умолчанию уже в this
    });
},

  saveToLocalStorage: function() {
    var data = {
        operations: this.operations,
        settings: this.settings,
        parts: this.parts,
        fuelLog: this.fuelLog,
        tireLog: this.tireLog,
        workCosts: this.workCosts,
        serviceRecords: this.serviceRecords,
        mileageHistory: this.mileageHistory,
        cars: this.cars,
        activeCarId: this.activeCarId,
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
