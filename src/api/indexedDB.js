// src/api/indexedDB.js
window.App = window.App || {};
App.db = App.db || {};

const DB_NAME = 'car_k3eeper';
const DB_VERSION = 1;

App.db.openDB = function() {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains('appData')) {
                db.createObjectStore('appData', { keyPath: 'id' });
            }
        };
        request.onsuccess = function(event) {
            resolve(event.target.result);
        };
        request.onerror = function(event) {
            reject(event.target.error);
        };
    });
};

App.db.saveAllData = function(data) {
    return App.db.openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction('appData', 'readwrite');
            var store = tx.objectStore('appData');
            var request = store.put({ id: 'main', data: data });
            request.onsuccess = function() { resolve(); };
            request.onerror = function(e) { reject(e.target.error); };
        });
    });
};

App.db.loadAllData = function() {
    return App.db.openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var tx = db.transaction('appData', 'readonly');
            var store = tx.objectStore('appData');
            var request = store.get('main');
            request.onsuccess = function(event) {
                var result = event.target.result;
                resolve(result ? result.data : null);
            };
            request.onerror = function(e) { reject(e.target.error); };
        });
    });
};

App.db.clearDB = function() {
    return App.db.openDB().then(function(db) {
        db.close();
        return new Promise(function(resolve, reject) {
            var request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = resolve;
            request.onerror = reject;
        });
    });
};

// Однократная миграция из localStorage в IndexedDB
App.db.migrateFromLocalStorage = function() {
    var cacheKey = App.config.CACHE_KEY;
    var cached = localStorage.getItem(cacheKey);
    if (!cached) return Promise.resolve(); // нечего мигрировать

    try {
        var d = JSON.parse(cached);
        // Получаем также ценовую историю и таймстемпы
        var priceHistory = localStorage.getItem(App.config.PRICE_HISTORY_KEY);
        var serverTimestamps = localStorage.getItem('vesta_server_timestamps');
        d.priceHistory = priceHistory ? JSON.parse(priceHistory) : {};
        d.serverTimestamps = serverTimestamps ? JSON.parse(serverTimestamps) : {};

        // Сохраняем в IndexedDB
        return App.db.saveAllData(d).then(function() {
            // Удаляем старые ключи из localStorage после успешного сохранения
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(App.config.PRICE_HISTORY_KEY);
            localStorage.removeItem('vesta_server_timestamps');
            console.log('[Migration] Данные перенесены из localStorage в IndexedDB');
        });
    } catch (e) {
        console.warn('[Migration] Ошибка миграции, данные не тронуты:', e);
        return Promise.resolve();
    }
};
