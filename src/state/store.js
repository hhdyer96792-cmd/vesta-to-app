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

    initFromIndexedDB: function() {
        var self = this;
        // Сначала миграция, если нужно
        return App.db.migrateFromLocalStorage().then(function() {
            return App.db.loadAllData();
        }).then(function(data) {
            if (data) {
                // Восстанавливаем все поля
                self.operations = data.operations || [];
                self.settings = data.settings || App.defaults.settings;
                self.parts = data.parts || [];
                self.fuelLog = data.fuelLog || [];
                self.tireLog = data.tireLog || [];
                self.workCosts = data.workCosts || [];
                self.serviceRecords = data.serviceRecords || [];
                self.mileageHistory = data.mileageHistory || [];
                self.baseMileage = data.baseMileage || 0;
                self.baseMotohours = data.baseMotohours || 0;
                self.purchaseDate = data.purchaseDate || '';
                self.cars = data.cars || [];
                self.activeCarId = data.activeCarId || null;
                self.ownershipDays = data.ownershipDays || 0;
                self.ownershipDisplayMode = data.ownershipDisplayMode || 'days';
                self.serverTimestamps = data.serverTimestamps || {};

                // Восстанавливаем историю цен (хранится в основном объекте)
                if (data.priceHistory) {
                    self._priceHistory = data.priceHistory;
                } else {
                    self._priceHistory = {};
                }
                // Применяем историю цен к запчастям
                self.parts.forEach(function(part) {
                    if (self._priceHistory[part.id]) {
                        part.priceHistory = self._priceHistory[part.id];
                    }
                });
            } else {
                // Если 데이터 вообще нет, оставляем значения по умолчанию
            }

            // Загружаем отложенные действия из localStorage (пока ещё там, до Этапа 2)
            var pendingRaw = localStorage.getItem(App.config.PENDING_KEY);
            self.pendingActions = pendingRaw ? JSON.parse(pendingRaw) : [];

            // Календарь оставляем в localStorage, так как это менее критично
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

            self.calculateOwnershipDays();
        }).catch(function(err) {
            console.error('Ошибка инициализации из IndexedDB, переключаемся на localStorage:', err);
            self.initFromLocalStorageFallback();
        });
    },

    // Аварийный метод при недоступности IndexedDB (использует старый localStorage)
    initFromLocalStorageFallback: function() {
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
        this.loadPriceHistoryFallback();
        this.activeCarId = localStorage.getItem('vesta_active_car_id') || null;
        this.calculateOwnershipDays();
    },

    // Заглушка для совместимости во время переходного периода
    initFromLocalStorage: function() {
        this.initFromIndexedDB().catch(function(e) {
            console.error(e);
        });
    },

    saveToIndexedDB: function() {
        var self = this;
        // Собираем объект с данными
        var priceHistory = {};
        self.parts.forEach(function(part) {
            if (part.priceHistory && part.priceHistory.length) {
                priceHistory[part.id] = part.priceHistory;
            }
        });

        var data = {
            operations: self.operations,
            settings: self.settings,
            parts: self.parts,
            fuelLog: self.fuelLog,
            tireLog: self.tireLog,
            workCosts: self.workCosts,
            serviceRecords: self.serviceRecords,
            mileageHistory: self.mileageHistory,
            cars: self.cars,
            activeCarId: self.activeCarId,
            baseMileage: self.baseMileage,
            baseMotohours: self.baseMotohours,
            purchaseDate: self.purchaseDate,
            ownershipDays: self.ownershipDays,
            ownershipDisplayMode: self.ownershipDisplayMode,
            serverTimestamps: self.serverTimestamps,
            priceHistory: priceHistory
        };

        // Сохраняем асинхронно (fire-and-forget)
        return App.db.saveAllData(data).catch(function(err) {
            console.warn('Не удалось сохранить данные в IndexedDB:', err);
            // При ошибке пытаемся сохранить в localStorage как запасной вариант
            self.saveToLocalStorageSync();
        });
    },

    // Синхронное сохранение в localStorage (используется как fallback)
    saveToLocalStorageSync: function() {
        localStorage.setItem(App.config.CACHE_KEY, JSON.stringify({
            operations: this.operations,
            settings: this.settings,
            parts: this.parts,
            fuelLog: this.fuelLog,
            tireLog: this.tireLog,
            workCosts: this.workCosts,
            serviceRecords: this.serviceRecords,
            mileageHistory: this.mileageHistory,
            baseMileage: this.baseMileage,
            baseMotohours: this.baseMotohours,
            purchaseDate: this.purchaseDate
        }));
    },

    saveToLocalStorage: function() {
        // Точка входа для остального кода: вызываем IndexedDB-сохранение
        this.saveToIndexedDB();
    },

    saveServerTimestamps: function() {
        // Теперь serverTimestamps сохраняются вместе с остальными данными через saveToIndexedDB
        this.saveToIndexedDB();
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
        // Историю цен теперь загружаем вместе с остальными данными, метод оставлен для совместимости
        var self = this;
        // При инициализации _priceHistory уже установлен в initFromIndexedDB
        if (!self._priceHistory) {
            // на случай, если цена ещё не загружена, пробуем из localStorage (миграция)
            var stored = localStorage.getItem(App.config.PRICE_HISTORY_KEY);
            if (stored) {
                self._priceHistory = JSON.parse(stored);
            } else {
                self._priceHistory = {};
            }
        }
        self.parts.forEach(function(part) {
            if (self._priceHistory[part.id]) {
                part.priceHistory = self._priceHistory[part.id];
            }
        });
    },

    loadPriceHistoryFallback: function() {
        // загрузка только из localStorage (используется в аварийном режиме)
        var stored = localStorage.getItem(App.config.PRICE_HISTORY_KEY);
        if (stored) {
            var historyData = JSON.parse(stored);
            var parts = this.parts;
            for (var i = 0; i < parts.length; i++) {
                if (historyData[parts[i].id]) {
                    parts[i].priceHistory = historyData[parts[i].id];
                }
            }
        }
    },

    savePriceHistory: function() {
        // Теперь saveToIndexedDB сохранит историю цен вместе с остальным
        this.saveToIndexedDB();
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
