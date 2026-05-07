// src/api/google/sheets.js
window.App = window.App || {};
App.api = App.api || {};

App.api.call = function(url, options) {
    options = options || {};
    if (!App.auth.accessToken) throw new Error('Not authorized');

    var makeRequest = function(token) {
        var headers = options.headers || {};
        headers['Authorization'] = 'Bearer ' + token;
        return fetch(url, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body
        });
    };

    return makeRequest(App.auth.accessToken).then(function(res) {
        if (res.status === 401) {
            App.log('Токен истёк, обновляем...');
            return App.auth.refreshAccessToken().then(function() {
                return makeRequest(App.auth.accessToken);
            });
        }
        if (!res.ok) throw new Error('API error: ' + res.status);
        return res.json();
    }).catch(function(e) {
        if (e.message && e.message.indexOf('Not authorized') !== -1) throw e;
        throw e;
    });
};

App.api.request = function(url, options) {
    return App.api.call(url, options).catch(function(err) {
        console.error('API error:', err);
        App.toast('Ошибка соединения с Google. Попробуйте позже.', 'error');
        throw err;
    });
};

App.api.readSheet = function(range) {
    return App.api.request(
        'https://sheets.googleapis.com/v4/spreadsheets/' + App.store.spreadsheetId + '/values/' + range
    ).then(function(data) {
        return data.values || [];
    });
};

App.api.writeSheet = function(range, values) {
    return App.api.request(
        'https://sheets.googleapis.com/v4/spreadsheets/' + App.store.spreadsheetId + '/values/' + range + '?valueInputOption=USER_ENTERED',
        { method: 'PUT', body: JSON.stringify({ values: values }) }
    );
};

App.api.appendSheet = function(range, values) {
    return App.api.request(
        'https://sheets.googleapis.com/v4/spreadsheets/' + App.store.spreadsheetId + '/values/' + range + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
        { method: 'POST', body: JSON.stringify({ values: values }) }
    );
};

App.api.safeWriteSheet = function(range, values) {
    if (App.auth.accessToken) {
        return App.api.writeSheet(range, values);
    } else {
        App.store.addPendingAction({ type: 'write', range: range, values: values });
        return Promise.resolve();
    }
};

App.api.safeAppendSheet = function(range, values) {
    if (App.auth.accessToken) {
        return App.api.appendSheet(range, values);
    } else {
        App.store.addPendingAction({ type: 'append', range: range, values: values });
        return Promise.resolve();
    }
};

/**
 * Пакетная запись: принимает массив действий и отправляет их одним запросом.
 */
App.api.batchWrite = function(requests) {
    if (!requests.length) return Promise.resolve();
    var body = {
        valueInputOption: 'USER_ENTERED',
        data: requests.map(function(r) {
            return {
                range: r.range,
                values: r.values
            };
        })
    };
    return App.api.request(
        'https://sheets.googleapis.com/v4/spreadsheets/' + App.store.spreadsheetId + '/values:batchUpdate',
        { method: 'POST', body: JSON.stringify(body) }
    );
};

/**
 * Загрузка данных из Sheets.
 */
App.loadSheet = function() {
    if (!App.store.spreadsheetId) {
        App.store.initFromLocalStorage();
        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.renderAll === 'function') App.renderAll();
        return Promise.resolve();
    }
    if (!App.auth.accessToken) {
        App.store.initFromLocalStorage();
        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.renderAll === 'function') App.renderAll();
        return Promise.resolve();
    }

    App.setSyncStatus('syncing');

    return Promise.all([
        App.api.readSheet(App.config.SHEET_MAINTENANCE + '!A2:O'),
        App.api.readSheet(App.config.RANGE_SETTINGS),
        App.api.readSheet(App.config.SHEET_PARTS + '!A2:J').catch(function() { return []; }),
        App.api.readSheet(App.config.SHEET_TIRES + '!A2:K').catch(function() { return []; }),
        App.api.readSheet(App.config.SHEET_WORK_COSTS + '!A2:E').catch(function() { return []; })
    ]).then(function(results) {
        var opsData = results[0];
        var settingsData = results[1];
        var partsData = results[2];
        var tiresData = results[3];
        var workCostsData = results[4];

        App.store.operations = opsData.filter(function(r) { return r[1]; }).map(function(r, i) {
            var lastDate = null;
            if (r[2]) {
                var p = new Date(r[2]);
                lastDate = isNaN(p.getTime()) ? null : p.toISOString().split('T')[0];
            }
            var updatedAt = r[14] || '';
            if (updatedAt) {
                App.store.serverTimestamps['operation:' + (i+2)] = updatedAt;
            }
            return {
                id: i + 2,
                rowIndex: i + 2,
                category: r[0] || '',
                name: r[1],
                intervalKm: +r[5] || 0,
                intervalMonths: +r[6] || 0,
                intervalMotohours: r[7] ? +r[7] : null,
                lastDate: lastDate,
                lastMileage: +r[3] || 0,
                lastMotohours: +r[4] || 0
            };
        });

        if (settingsData.length >= 8) {
            App.store.settings.currentMileage = +settingsData[0][0] || 0;
            App.store.settings.currentMotohours = +settingsData[1][0] || 0;
            App.store.settings.avgDailyMileage = +settingsData[2][0] || App.defaults.settings.avgDailyMileage;
            App.store.settings.avgDailyMotohours = +settingsData[3][0] || App.defaults.settings.avgDailyMotohours;
            App.store.settings.telegramToken = settingsData[6] && settingsData[6][0] ? settingsData[6][0] : '';
            App.store.settings.telegramChatId = settingsData[7] && settingsData[7][0] ? settingsData[7][0] : '';
        }

        App.store.parts = partsData.map(function(r, i) {
            var updatedAt = r[9] || '';
            if (updatedAt) {
                App.store.serverTimestamps['part:' + (i+2)] = updatedAt;
            }
            var priceHistory = [];
            var oldPrice = r[3] || '';
            if (oldPrice !== '') {
                priceHistory.push({ date: new Date().toISOString().split('T')[0], price: parseFloat(oldPrice), supplier: r[4] || '' });
            }
            return {
                id: i + 2,
                operation: r[0] || '',
                oem: r[1] || '',
                analog: r[2] || '',
                price: oldPrice,
                supplier: r[4] || '',
                link: r[5] || '',
                comment: r[6] || '',
                inStock: r[7] ? parseFloat(r[7]) : 0,
                location: r[8] || '',
                priceHistory: priceHistory
            };
        });
        App.store.loadPriceHistory();

        return App.api.readSheet(App.config.SHEET_FUEL + '!A2:H').catch(function() { return []; }).then(function(fuelData) {
            App.store.fuelLog = fuelData.map(function(r, i) {
                var updatedAt = r[7] || '';
                if (updatedAt) {
                    App.store.serverTimestamps['fuel:' + (i+2)] = updatedAt;
                }
                return {
                    date: typeof r[0] === 'number' ? App.utils.excelDateToISO(r[0]) : r[0],
                    mileage: +r[1],
                    liters: +r[2],
                    pricePerLiter: +r[3],
                    fullTank: r[4],
                    fuelType: r[5] || 'Бензин',
                    notes: r[6]
                };
            }).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

            App.store.tireLog = tiresData.map(function(r, i) {
                var updatedAt = r[10] || '';
                if (updatedAt) {
                    App.store.serverTimestamps['tire:' + (i+2)] = updatedAt;
                }
                return {
                    date: typeof r[0] === 'number' ? App.utils.excelDateToISO(r[0]) : r[0],
                    type: r[1] || '',
                    mileage: +r[2] || 0,
                    model: r[3] || '',
                    size: r[4] || '',
                    wear: r[5] || '',
                    notes: r[6] || '',
                    purchaseCost: +r[7] || 0,
                    mountCost: +r[8] || 0,
                    isDIY: r[9] === 'TRUE' || r[9] === true
                };
            }).sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

            App.store.workCosts = workCostsData.map(function(r, i) {
                var updatedAt = r[4] || '';
                if (updatedAt) {
                    App.store.serverTimestamps['workcost:' + (i+2)] = updatedAt;
                }
                return { operationId: +r[0], cost: +r[1], isDIY: r[2] === 'TRUE', notes: r[3] };
            });

            return App.api.readSheet(App.config.SHEET_MILEAGE + '!A2:D').catch(function() { return []; });
        }).then(function(mileageData) {
            App.store.mileageHistory = mileageData.map(function(r, i) {
                var updatedAt = r[3] || '';
                if (updatedAt) {
                    App.store.serverTimestamps['mileage:' + (i+2)] = updatedAt;
                }
                return { date: r[0], mileage: +r[1], motohours: +r[2] };
            }).sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

            return App.api.readSheet(App.config.SHEET_MAINTENANCE + '!Q9:Q12').catch(function() { return []; });
        }).then(function(extraSettings) {
            if (extraSettings.length >= 4) {
                App.store.baseMileage = +extraSettings[0][0] || 0;
                App.store.baseMotohours = +extraSettings[1][0] || 0;
                App.store.purchaseDate = extraSettings[2] && extraSettings[2][0] ? extraSettings[2][0] : '';
            }
            App.store.calculateOwnershipDays();
            App.store.saveToLocalStorage();
            App.store.saveServerTimestamps();
            document.getElementById('data-panel').style.display = 'block';
            App.setSyncStatus('synced');

            return App.api.getOrCreatePhotoFolder();
        }).then(function(folderId) {
            App.store.driveFolderId = folderId;
            App.loadHistory();
            if (App.store.addOrUpdateProfile) App.store.addOrUpdateProfile(App.store.spreadsheetId);
            if (typeof App.renderAll === 'function') App.renderAll();
            App.api.syncPendingActions();
        });
    }).catch(function(e) {
        console.error(e);
        App.toast('Не удалось загрузить данные из таблицы. Работаем с локальным кэшем.', 'error');
        App.setSyncStatus('error');
        App.store.initFromLocalStorage();
        document.getElementById('data-panel').style.display = 'block';
        if (typeof App.renderAll === 'function') App.renderAll();
    });
};

App.loadHistory = function() {
    if (!App.store.spreadsheetId) return Promise.resolve();
    return App.api.readSheet(App.config.SHEET_HISTORY + '!A2:K').then(function(raw) {
        var validRows = [];
        var hData = [];
        raw.forEach(function(r, i) {
            if (r.some(function(c) { return c !== '' && c != null; })) {
                hData.push(r);
                validRows.push(i + 2);
            }
        });
        App.store.serviceRecords = hData.map(function(row, idx) {
            var updatedAt = row[10] || '';
            if (updatedAt) {
                App.store.serverTimestamps['history:' + (validRows[idx])] = updatedAt;
            }
            return {
                rowIndex: validRows[idx],
                operation_id: row[0],
                date: typeof row[1] === 'number' ? App.utils.excelDateToISO(row[1]) : row[1],
                mileage: row[2],
                motohours: row[3],
                parts_cost: row[4],
                work_cost: row[5],
                is_diy: row[6],
                notes: row[7],
                photo_url: row[8],
                timestamp: row[9]
            };
        });
        App.store.saveServerTimestamps();
        if (typeof App.ui.pages.populateHistoryOperationFilter === 'function') App.ui.pages.populateHistoryOperationFilter();
        if (typeof App.ui.pages.renderHistoryWithFilters === 'function') App.ui.pages.renderHistoryWithFilters();
    }).catch(function(e) {
        App.log(e);
        App.toast('Не удалось загрузить историю.', 'error');
    });
};

App.api.syncPendingActions = function() {
    var pending = App.store.pendingActions;
    if (!pending.length) return Promise.resolve();
    App.setSyncStatus('syncing');
    return App.api.batchWrite(pending).then(function() {
        App.store.clearPendingActions();
        App.setSyncStatus('synced');
        App.toast('Офлайн-действия синхронизированы', 'success');
    }).catch(function(e) {
        App.setSyncStatus('error');
        App.toast('Ошибка синхронизации офлайн-действий', 'error');
    });
};

App.api.getOrCreatePhotoFolder = function() {
    var query = encodeURIComponent("name='" + App.config.DRIVE_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    return App.api.request('https://www.googleapis.com/drive/v3/files?q=' + query).then(function(res) {
        if (res.files && res.files.length) return res.files[0].id;
        var metadata = { name: App.config.DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' };
        return App.api.request('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify(metadata) }).then(function(createRes) {
            return createRes.id;
        });
    });
};

App.api.uploadPhoto = function(file) {
    var metadata = { name: new Date().toISOString() + '_' + file.name, mimeType: file.type, parents: [App.store.driveFolderId] };
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + App.auth.accessToken },
        body: form
    }).then(function(res) {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    }).then(function(data) {
        return 'https://drive.google.com/file/d/' + data.id + '/view';
    }).catch(function(err) {
        App.toast('Ошибка загрузки фото', 'error');
        throw err;
    });
};

App.api.syncAllToSheet = function() {
    var opsRows = App.store.operations.map(function(o) {
        return [o.category, o.name, o.lastDate || '', o.lastMileage || '', o.lastMotohours || '', o.intervalKm, o.intervalMonths, o.intervalMotohours || '', '', '', '', '', '', '', new Date().toISOString()];
    });
    var settingsRow = [
        [App.store.settings.currentMileage],
        [App.store.settings.currentMotohours],
        [App.store.settings.avgDailyMileage],
        [App.store.settings.avgDailyMotohours],
        [],
        [],
        [App.store.settings.telegramToken],
        [App.store.settings.telegramChatId],
        [App.store.baseMileage],
        [App.store.baseMotohours],
        [App.store.purchaseDate],
        []
    ];
    var requests = [
        { type: 'write', range: App.config.SHEET_MAINTENANCE + '!A2:O', values: opsRows },
        { type: 'write', range: App.config.RANGE_SETTINGS, values: settingsRow }
    ];
    return App.api.batchWrite(requests);
};