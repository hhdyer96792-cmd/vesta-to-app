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
        var cached = localStorage.getItem(App.config.CACHE_KEY);
        if (cached) {
            var d = JSON.parse(cached);
            this.operations = d.operations || [];
            this.settings = d.settings || App.defaults.settings;
            this.parts = d.parts || [];
            this.fuelLog = d.fuelLog || [];
            this.tireLog = d.tireLog || [];
            this.workCosts = d.workCosts || [];
            this.baseMileage = d.baseMileage || 0;
            this.baseMotohours = d.baseMotohours || 0;
            this.purchaseDate = d.purchaseDate || '';
        }
        var pendingRaw = localStorage.getItem(App.config.PENDING_KEY);
        this.pendingActions = pendingRaw ? JSON.parse(pendingRaw) : [];
        try {
            var calRaw = localStorage.getItem(App.config.CALENDAR_CACHE_KEY);
            if (calRaw) {
                var entries = JSON.parse(calRaw);
                this.calendarEventCache = new Map(entries);
            }
        } catch (e) {}
        var notifMethod = localStorage.getItem(App.config.NOTIFICATION_METHOD_KEY);
        if (notifMethod) {
            this.settings.notificationMethod = notifMethod;
        }
        this.loadPriceHistory();
        this.activeCarId = localStorage.getItem('vesta_active_car_id') || null;

        this.calculateOwnershipDays();
    },

    saveToLocalStorage: function() {
        localStorage.setItem(App.config.CACHE_KEY, JSON.stringify({
            operations: this.operations,
            settings: this.settings,
            parts: this.parts,
            fuelLog: this.fuelLog,
            tireLog: this.tireLog,
            workCosts: this.workCosts,
            baseMileage: this.baseMileage,
            baseMotohours: this.baseMotohours,
            purchaseDate: this.purchaseDate
        }));
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