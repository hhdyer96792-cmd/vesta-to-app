// src/api/indexedDB.js
window.App = window.App || {};
App.indexedDB = App.indexedDB || {};

const DB_NAME = 'car_k3eeper';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const DATA_KEY = 'main';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = function(event) {
            resolve(event.target.result);
        };
        request.onerror = function(event) {
            reject(event.target.error);
        };
    });
}

/**
 * Сохраняет все данные приложения в IndexedDB
 * @param {object} data - объект со свойствами (operations, fuelLog, ...)
 */
App.indexedDB.saveAllData = function(data) {
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(data, DATA_KEY);
            request.onsuccess = function() { resolve(); };
            request.onerror = function() { reject(request.error); };
        });
    });
};

/**
 * Загружает все данные приложения из IndexedDB
 * @returns {Promise<object|null>}
 */
App.indexedDB.loadAllData = function() {
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(DATA_KEY);
            request.onsuccess = function() { resolve(request.result || null); };
            request.onerror = function() { reject(request.error); };
        });
    });
};

/**
 * Очищает всю базу данных (для служебных целей)
 */
App.indexedDB.clearDB = function() {
    return new Promise(function(resolve, reject) {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = function() { resolve(); };
        request.onerror = function() { reject(request.error); };
    });
};
