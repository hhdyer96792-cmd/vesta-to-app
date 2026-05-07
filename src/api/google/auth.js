// src/api/google/auth.js
window.App = window.App || {};
App.auth = {
    tokenClient: null,
    accessToken: null,

    initGoogleApi: function() {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
            setTimeout(function() { App.auth.initGoogleApi(); }, 500);
            return;
        }

        App.auth.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: App.config.CLIENT_ID,
            scope: App.config.SCOPES,
            callback: function(tokenResponse) {
                if (tokenResponse.access_token) {
                    App.auth.accessToken = tokenResponse.access_token;
                    document.getElementById('auth-status').textContent = '✅ Авторизован';
                    document.getElementById('auth-panel').style.display = 'none';
                    App.setSyncStatus('synced');

                    var lastId = (App.store && App.store.getLastUsedProfileId) ? App.store.getLastUsedProfileId() : localStorage.getItem(App.config.LAST_PROFILE_KEY);
                    if (lastId) {
                        App.store.spreadsheetId = lastId;
                        if (typeof App.loadSheet === 'function') App.loadSheet();
                        if (App.store && App.store.addOrUpdateProfile) App.store.addOrUpdateProfile(lastId);
                    } else {
                        if (typeof App.showCarSelectModal === 'function') App.showCarSelectModal();
                    }
                }
            },
            error_callback: function(error) {
                // Тихая проверка не удалась — просто покажем кнопку входа
                console.error('Тихая авторизация не удалась:', error);
                document.getElementById('auth-panel').style.display = 'block';
                document.getElementById('auth-status').textContent = '⚠️ Требуется вход';
            }
        });

        // Задержка 1.5 секунды перед попыткой бесшумной авторизации
        setTimeout(function() {
            document.getElementById('auth-status').textContent = '⏳ Проверка сессии...';
            try {
                // prompt: 'none' — если сессия есть, токен получим молча; если нет — сработает error_callback
                App.auth.tokenClient.requestAccessToken({ prompt: 'none' });
            } catch (e) {
                // На случай совсем старых браузеров
                document.getElementById('auth-panel').style.display = 'block';
                document.getElementById('auth-status').textContent = '⚠️ Требуется вход';
            }
        }, 1500);
    },

    startAuth: function() {
        // Явный вход — вызывается по кнопке, здесь окно Google откроется ОДИН раз, что нормально
        if (App.auth.tokenClient) {
            App.auth.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            console.error('TokenClient не инициализирован');
            setTimeout(function() { App.auth.startAuth(); }, 500);
        }
    },

    refreshAccessToken: function() {
        return new Promise(function(resolve, reject) {
            if (!App.auth.tokenClient) {
                reject(new Error('TokenClient не инициализирован'));
                return;
            }
            var originalCallback = App.auth.tokenClient.callback;
            App.auth.tokenClient.callback = function(tokenResponse) {
                App.auth.tokenClient.callback = originalCallback;
                if (tokenResponse.access_token) {
                    App.auth.accessToken = tokenResponse.access_token;
                    resolve(true);
                } else {
                    reject(new Error('Не удалось обновить токен'));
                }
            };
            App.auth.tokenClient.requestAccessToken({ prompt: '' });
        });
    }
};