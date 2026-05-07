// src/main.js
(function() {
    var isLoggedIn = false;
    var deferredPrompt = null;

    // ... (функции setInstallButtonVisible, doLogout, recoverViaTelegram и т.д. остаются без изменений)
    // Они уже были в предоставленном коде, просто перемещаем внутрь области видимости.

    function setInstallButtonVisible(visible) {
        var installBtn = document.getElementById('pwa-install-btn');
        if (!installBtn) return;
        if (window.matchMedia('(display-mode: standalone)').matches) {
            installBtn.style.display = 'none';
            return;
        }
        if (visible && deferredPrompt) {
            installBtn.style.display = 'block';
        } else {
            installBtn.style.display = 'none';
        }
    }

    async function onReady() {
        // Тема
        var savedTheme = localStorage.getItem(App.config.THEME_KEY);
        if (savedTheme) {
            App.events.applyTheme(savedTheme);
        } else {
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            App.events.applyTheme(prefersDark ? 'dark' : 'light');
        }

        // Supabase
        App.supabase = supabase.createClient(
            'https://qbjlccdqaudyvedpysil.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiamxjY2RxYXVkeXZlZHB5c2lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjQ5MDEsImV4cCI6MjA5Mjk0MDkwMX0.dpdlcOQLtc6adA-l2z_ksJ3b6b6pLTQviLrKtxuF-kU'
        );

        // Persistent Storage
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().then(function(isPersisted) {
                console.log('Persistent storage:', isPersisted ? '✅ granted' : '❌ denied');
            });
        }

        // Инициализация IndexedDB и загрузка данных вместо старого initFromLocalStorage
        try {
            await App.store.initFromIndexedDB();
        } catch (e) {
            console.warn('Ошибка инициализации IndexedDB, используется localStorage:', e);
            App.store.initFromLocalStorageFallback();
        }

        // Далее авторизация и UI как раньше, но теперь данные из хранилища уже загружены.
        // (код авторизации, вкладок, Google, Apple, почты – без изменений, просто копируем из существующего main.js)

        // ======================= АВТОРИЗАЦИЯ =======================
        var authPanel = document.getElementById('auth-panel');
        if (authPanel) authPanel.style.display = 'block';

        // Вкладки
        var tabLogin = document.getElementById('tab-login');
        var tabSocial = document.getElementById('tab-social');
        var authLoginDiv = document.getElementById('auth-login');
        var authSocialDiv = document.getElementById('auth-social');

        function switchAuthTab(tab) {
            if (tab === 'login') {
                tabLogin.classList.add('active'); tabSocial.classList.remove('active');
                authLoginDiv.style.display = 'block'; authSocialDiv.style.display = 'none';
            } else {
                tabSocial.classList.add('active'); tabLogin.classList.remove('active');
                authSocialDiv.style.display = 'block'; authLoginDiv.style.display = 'none';
            }
        }
        if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
        if (tabSocial) tabSocial.addEventListener('click', () => switchAuthTab('social'));

        // Google
        var googleBtn = document.getElementById('supabase-auth-btn');
        if (googleBtn) {
            googleBtn.addEventListener('click', function() {
                App.supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin }
                }).catch(function(err) { App.toast('Ошибка входа через Google', 'error'); });
            });
        }

        // Apple
        var appleBtn = document.getElementById('apple-auth-btn');
        if (appleBtn) {
            appleBtn.addEventListener('click', function() {
                App.supabase.auth.signInWithOAuth({
                    provider: 'apple',
                    options: { redirectTo: window.location.origin }
                }).catch(function(err) { App.toast('Ошибка входа через Apple', 'error'); });
            });
        }

        // ===== Логин + пароль =====
        var loginForm = document.getElementById('login-form');
        var loginMessage = document.getElementById('login-message');
        var passwordConfirmLabel = document.getElementById('password-confirm-label');
        var passwordConfirmInput = document.getElementById('password-confirm-input');

        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                var formData = new FormData(loginForm);
                var username = formData.get('username').trim();
                var password = formData.get('password');
                if (!username || !password) {
                    App.toast('Введите логин и пароль', 'error');
                    return;
                }
                var email = username + '@vesta.internal';
                App.supabase.auth.signInWithPassword({ email: email, password: password })
                    .then(function({ error }) {
                        if (error) loginMessage.textContent = 'Неверный логин или пароль.';
                    });
            });

            var signUpBtn = document.getElementById('login-sign-up-btn');
            if (signUpBtn) {
                signUpBtn.addEventListener('click', function() {
                    passwordConfirmLabel.style.display = 'block';
                    passwordConfirmInput.style.display = 'block';
                    passwordConfirmInput.required = true;

                    var formData = new FormData(loginForm);
                    var username = formData.get('username').trim();
                    var password = formData.get('password');
                    var passwordConfirm = formData.get('password_confirm');
                    if (!username || !password || !passwordConfirm) {
                        App.toast('Все поля обязательны', 'error');
                        return;
                    }
                    if (password !== passwordConfirm) {
                        App.toast('Пароли не совпадают', 'error');
                        return;
                    }
                    if (password.length < 6) {
                        App.toast('Пароль должен содержать минимум 6 символов', 'error');
                        return;
                    }

                    var email = username + '@vesta.internal';
                    App.supabase.auth.signUp({
                        email: email,
                        password: password,
                        options: { data: { username: username } }
                    }).then(function({ error }) {
                        if (error) {
                            App.toast('Ошибка регистрации: ' + error.message, 'error');
                        } else {
                            App.toast('Регистрация успешна! Выполняем вход...', 'success');
                            App.supabase.auth.signInWithPassword({ email: email, password: password })
                                .then(function({ error }) {
                                    if (!error) {
                                        passwordConfirmLabel.style.display = 'none';
                                        passwordConfirmInput.style.display = 'none';
                                        passwordConfirmInput.required = false;
                                        loginForm.reset();
                                        loginMessage.textContent = '';

                                        App.supabase.auth.getUser().then(function({ data: { user } }) {
                                            if (user) generateAndShowRecoveryCodes(user.id, username);
                                        });
                                    } else {
                                        App.toast('Регистрация прошла, но вход не удался. Войдите вручную.', 'warning');
                                    }
                                });
                        }
                    });
                });
            }
        }

        // ===== Восстановление доступа =====
        var forgotLink = document.getElementById('forgot-access-link');
        var recoveryBlock = document.getElementById('recovery-options');
        var recoveryMsg = document.getElementById('recovery-message');
        if (forgotLink) {
            forgotLink.addEventListener('click', function(e) {
                e.preventDefault();
                recoveryBlock.style.display = 'block';
            });
        }

        var btnTelegram = document.getElementById('recover-telegram');
        if (btnTelegram) btnTelegram.addEventListener('click', () => recoverViaTelegram(recoveryMsg));

        var btnCode = document.getElementById('recover-code');
        if (btnCode) btnCode.addEventListener('click', () => recoverViaRecoveryCode(recoveryMsg));

        var btnRecoverGoogle = document.getElementById('recover-google');
        if (btnRecoverGoogle) {
            btnRecoverGoogle.addEventListener('click', function() {
                App.supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin }
                });
            });
        }

        // Кнопка установки PWA – управляется через setInstallButtonVisible
        var installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.style.display = 'none';

        if (window.matchMedia('(display-mode: standalone)').matches) {
            setInstallButtonVisible(false);
        }

        window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            deferredPrompt = e;
            setInstallButtonVisible(isLoggedIn);
        });
        window.addEventListener('appinstalled', function() {
            console.log('App installed');
            deferredPrompt = null;
            setInstallButtonVisible(false);
        });

        setTimeout(function() {
            if (!deferredPrompt && installBtn && isLoggedIn) {
                installBtn.style.display = 'block';
                installBtn.addEventListener('click', function() {
                    alert('Чтобы установить приложение, откройте меню браузера и выберите "Добавить на главный экран" (или "Установить").');
                });
            }
        }, 3000);

        // ===== Firebase Cloud Messaging =====
        var messaging;
        try {
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
                firebase.initializeApp({
                    apiKey: "AIzaSyCKz1GKDdqxtK6NyLQAZ84QqUUCaqTQDWQ",
                    authDomain: "car-k3eeper.firebaseapp.com",
                    projectId: "car-k3eeper",
                    storageBucket: "car-k3eeper.firebasestorage.app",
                    messagingSenderId: "826833638199",
                    appId: "1:826833638199:web:647fedbe3eae5b605240b2"
                });
            }
            if (typeof firebase !== 'undefined' && firebase.messaging) {
                messaging = firebase.messaging();

                function saveTokenWithRetry(attempt) {
                    attempt = attempt || 1;
                    navigator.serviceWorker.ready.then(function(registration) {
                        messaging.getToken({
                            vapidKey: 'BEUVrsWau5E4NvAwwAKmkjfK8yoDVntppWmZ2IdqseLVxuNNy47bV7eOLVYDmZ1b2P3F27eRqJLoAjW58Fh0tyY',
                            serviceWorkerRegistration: registration
                        }).then(function(currentToken) {
                            if (!currentToken) return;
                            console.log('FCM token:', currentToken);
                            App.supabase.auth.getUser().then(function({ data: { user } }) {
                                if (!user) return;
                                App.supabase.from('push_subscriptions').upsert({
                                    user_id: user.id,
                                    player_id: currentToken,
                                    updated_at: new Date().toISOString()
                                }, { onConflict: 'user_id' }).then(function() {
                                    console.log('FCM token saved');
                                    updatePushUI(true);
                                });
                            }).catch(function(err) {
                                console.warn('getUser error, retrying in 1s', err);
                                if (attempt < 3) {
                                    setTimeout(function() { saveTokenWithRetry(attempt + 1); }, 1000);
                                }
                            });
                        }).catch(console.error);
                    });
                }

                window.requestPushPermission = function() {
                    Notification.requestPermission().then(function(permission) {
                        if (permission === 'granted') {
                            saveTokenWithRetry();
                        }
                    });
                };
                var subscribePushBtn = document.getElementById('subscribe-push-btn');
                if (subscribePushBtn) {
                    subscribePushBtn.addEventListener('click', function() {
                        if (typeof window.requestPushPermission === 'function') {
                            window.requestPushPermission();
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('Firebase init skipped:', e);
        }

        var unsubscribePushBtn = document.getElementById('unsubscribe-push-btn');
        if (unsubscribePushBtn) {
            unsubscribePushBtn.addEventListener('click', async function() {
                try {
                    if (messaging) {
                        await messaging.deleteToken();
                    }
                } catch(e) {
                    console.warn('Token delete failed:', e);
                }
                var { data: { user } } = await App.supabase.auth.getUser();
                if (user) {
                    await App.supabase.from('push_subscriptions').delete().eq('user_id', user.id);
                }
                updatePushUI(false);
                App.toast('Подписка на push отключена', 'success');
            });
        }

        function updatePushUI(isActive) {
            var pushStatus = document.getElementById('push-status');
            var subBtn = document.getElementById('subscribe-push-btn');
            var unsubBtn = document.getElementById('unsubscribe-push-btn');
            if (pushStatus) pushStatus.textContent = isActive ? '✅ Push активны' : 'Push-уведомления не настроены';
            if (subBtn) subBtn.style.display = isActive ? 'none' : 'inline-block';
            if (unsubBtn) unsubBtn.style.display = isActive ? 'inline-block' : 'none';
        }

        // ===== Кнопка «Выйти» =====
        function doLogout() {
            var loginForm = document.getElementById('login-form');
            if (loginForm) loginForm.reset();
            var usernameDisplay = document.getElementById('username-display');
            if (usernameDisplay) usernameDisplay.textContent = '';
            var carContainer = document.getElementById('car-selector-container');
            if (carContainer) carContainer.innerHTML = '';
            var authPanel = document.getElementById('auth-panel');
            if (authPanel) authPanel.style.display = 'block';
            var dataPanel = document.getElementById('data-panel');
            if (dataPanel) dataPanel.style.display = 'none';
            App.supabase.auth.signOut().catch(function(e) { console.warn('Signout error', e); });
            isLoggedIn = false;
            setInstallButtonVisible(false);
        }
        var logoutSidebarBtn = document.getElementById('sidebar-logout');
        if (logoutSidebarBtn) logoutSidebarBtn.addEventListener('click', doLogout);
        var logoutDrawerBtn = document.getElementById('drawer-logout');
        if (logoutDrawerBtn) logoutDrawerBtn.addEventListener('click', doLogout);

        // ======================= СЕССИЯ (с Realtime) =======================
        async function handleOnlineSession() {
            if (!navigator.onLine) {
                // Офлайн: просто показываем данные из localStorage
                isLoggedIn = true;
                setInstallButtonVisible(true);
                if (authPanel) authPanel.style.display = 'none';
                var dp = document.getElementById('data-panel');
                if (dp) dp.style.display = 'block';

                var cachedUsername = localStorage.getItem('vesta_username') || '';
                var display = document.getElementById('username-display');
                if (display && cachedUsername) {
                    display.textContent = '👤 ' + cachedUsername;
                }

                App.store.loadCars().then(function() {
                    App.ui.pages.renderCarSelector();
                    if (App.store.activeCarId) {
                        // Realtime не подключаем
                    }
                    if (typeof App.renderAll === 'function') App.renderAll();
                });
                return;
            }

            // Онлайн: стандартная цепочка
            App.supabase.auth.onAuthStateChange(function(event, session) {
                if (session) {
                    isLoggedIn = true;
                    setInstallButtonVisible(true);
                    if (authPanel) authPanel.style.display = 'none';
                    var dp = document.getElementById('data-panel');
                    if (dp) dp.style.display = 'block';

                    App.supabase.auth.getUser().then(function({ data: { user } }) {
                        var display = document.getElementById('username-display');
                        if (display && user && user.user_metadata && user.user_metadata.username) {
                            display.textContent = '👤 ' + user.user_metadata.username;
                            localStorage.setItem('vesta_username', user.user_metadata.username);
                        }
                    });

                  App.store.initFromLocalStorage().then(function() {
        if (event === 'PASSWORD_RECOVERY') { ... }
                        var newPassword = prompt('Введите новый пароль (минимум 6 символов):');
                        if (newPassword && newPassword.length >= 6) {
                            App.supabase.auth.updateUser({ password: newPassword }).then(function({ error }) {
                                if (error) App.toast('Ошибка при смене пароля', 'error');
                                else {
                                    App.toast('Пароль успешно изменён!', 'success');
                                    window.location.hash = '';
                                    window.location.search = '';
                                }
                            });
                        }
                    }

                    App.supabase.auth.getUser().then(function({ data: { user } }) {
                        if (!user) return;
                        App.supabase.from('push_subscriptions').select('player_id').eq('user_id', user.id).limit(1).then(function({ data, error }) {
                            if (error) { console.warn('Ошибка проверки подписки:', error); return; }
                            updatePushUI(!!(data && data.length > 0));
                        });
                    });

                    App.store.loadCars().then(function() {
                        App.ui.pages.renderCarSelector();
                        App.ui.pages.checkPendingInvites();
                        if (App.store.activeCarId) {
                            if (App.realtime && App.realtime.subscribeToCar) {
                                App.realtime.subscribeToCar(App.store.activeCarId);
                            }
                            App.storage.loadAllData().then(function() {
                                if (typeof App.renderAll === 'function') App.renderAll();
                                // --- Восстановление редиректа после 404.html ---
                                var redirect = sessionStorage.redirect;
                                if (redirect) {
                                    sessionStorage.removeItem('redirect');
                                    var url = new URL(redirect);
                                    var inviteCode = url.searchParams.get('invite');
                                    if (inviteCode) {
                                        App.ui.pages.checkPendingInvites(); // повторно проверит, теперь с параметром
                                    }
                                }
                            });
                        } else {
                            if (typeof App.renderAll === 'function') App.renderAll();
                        }
                    });
                } else {
                    isLoggedIn = false;
                    setInstallButtonVisible(false);
                    if (authPanel) authPanel.style.display = 'block';
                    var dp = document.getElementById('data-panel');
                    if (dp) dp.style.display = 'none';
                    var carContainer = document.getElementById('car-selector-container');
                    if (carContainer) carContainer.innerHTML = '';
                    var usernameDisplay = document.getElementById('username-display');
                    if (usernameDisplay) usernameDisplay.textContent = '';
                    if (App.realtime && App.realtime.unsubscribeAll) {
                        App.realtime.unsubscribeAll();
                    }
                    App.store.operations = [];
                    App.store.fuelLog = [];
                    App.store.tireLog = [];
                    App.store.parts = [];
                    App.store.serviceRecords = [];
                    App.store.mileageHistory = [];
                    App.store.saveToLocalStorage();
                    if (typeof App.renderAll === 'function') App.renderAll();
                }
            });

            App.supabase.auth.getSession().then(function({ data: { session } }) {
    if (session) {
        isLoggedIn = true;
                    setInstallButtonVisible(true);
                    if (authPanel) authPanel.style.display = 'none';
                    var dp = document.getElementById('data-panel');
                    if (dp) dp.style.display = 'block';

                    var user = session.user;
                    if (user) {
                        var display = document.getElementById('username-display');
                        if (display && user.user_metadata && user.user_metadata.username) {
                            display.textContent = '👤 ' + user.user_metadata.username;
                            localStorage.setItem('vesta_username', user.user_metadata.username);
                        }
                    }

                    if (user) {
                        App.supabase.from('push_subscriptions').select('player_id').eq('user_id', user.id).limit(1).then(function({ data, error }) {
                            if (error) { console.warn('Ошибка проверки подписки:', error); return; }
                            updatePushUI(!!(data && data.length > 0));
                        });
                    }

                    App.store.loadCars().then(function() {
                        App.ui.pages.renderCarSelector();
                        if (App.store.activeCarId) {
                            if (App.realtime && App.realtime.subscribeToCar) {
                                App.realtime.subscribeToCar(App.store.activeCarId);
                            }
                            App.storage.loadAllData().then(function() {
                                if (typeof App.renderAll === 'function') App.renderAll();
                                // --- Восстановление редиректа после 404.html ---
                                var redirect = sessionStorage.redirect;
                                if (redirect) {
                                    sessionStorage.removeItem('redirect');
                                    var url = new URL(redirect);
                                    var inviteCode = url.searchParams.get('invite');
                                    if (inviteCode) {
                                        App.ui.pages.checkPendingInvites(); // обработает приглашение
                                    }
                                }
                            });
                        } else {
                            if (typeof App.renderAll === 'function') App.renderAll();
                        }
                    });
                }
            });
        }

        // === Обработчики online/offline ===
        window.addEventListener('online', function() {
            App.toast('Сеть восстановлена', 'success');
            // Синхронизируем офлайн-действия (минимальная реализация)
            if (App.store.pendingActions.length > 0) {
                App.toast('Синхронизация офлайн-изменений...', 'info');
                App.store.pendingActions.forEach(function(action) {
                    if (action.type === 'service') {
                        App.logic.addServiceRecord(
                            action.opId, action.date, action.mileage, action.motohours,
                            action.partsCost, action.workCost, action.isDIY, action.notes, action.photoUrl
                        );
                    }
                    // Здесь можно добавить другие типы действий
                });
                App.store.clearPendingActions();
            }
            handleOnlineSession();
        });
        window.addEventListener('offline', function() {
            App.toast('Вы офлайн', 'warning');
        });

        handleOnlineSession();

        // ==================== РЕГИСТРАЦИЯ СЕРВИС‑ВОРКЕРА ====================
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(new URL('./service-worker.js', location.href)).then(function(registration) {
                console.log('✅ Сервис-воркер зарегистрирован:', registration.scope);
            }).catch(function(err) {
                console.error('❌ Ошибка регистрации сервис-воркера:', err);
            });
        }

        // ===== Остальные инициализации =====
        App.events.init();
        App.events.switchToTab('dashboard');

        window.addEventListener('load', function() {
            setTimeout(App.initIcons, 200);
        });
    }

    // ===== Функции восстановления =====
    async function recoverViaTelegram(msgEl) {
        var username = prompt('Введите ваш логин:');
        if (!username) return;

        var { data: users, error } = await App.supabase.rpc('get_user_by_username', { p_username: username });
        if (error || !users || users.length === 0) { msgEl.textContent = 'Пользователь не найден'; return; }
        var userData = users[0];

        var { data: settings, error: settingsError } = await App.supabase.rpc('get_telegram_settings', { p_user_id: userData.id });
        if (settingsError || !settings || !settings.telegram_chat_id || !settings.telegram_token) {
            msgEl.textContent = 'Telegram не привязан. Используйте другой способ.'; return;
        }

        var code = Math.floor(100000 + Math.random() * 900000).toString();
        await App.supabase.from('recovery_codes').insert({ user_id: userData.id, code_hash: code });
        await fetch(`https://api.telegram.org/bot${settings.telegram_token}/sendMessage`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ chat_id: settings.telegram_chat_id, text: `Код для сброса пароля: ${code}` })
        });

        var input = prompt('Код отправлен в Telegram. Введите его:');
        if (!input) return;

        var { data: resetToken, error: tokenError } = await App.supabase.rpc('consume_recovery_code', {
            p_user_id: userData.id,
            p_code: input
        });
        if (tokenError || !resetToken) { msgEl.textContent = 'Неверный код или срок истёк'; return; }

        var newPassword = prompt('Введите новый пароль (минимум 6 символов):');
        if (!newPassword || newPassword.length < 6) {
            msgEl.textContent = 'Пароль должен содержать не менее 6 символов';
            return;
        }

        var res = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/secure-reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_token: resetToken, newPassword: newPassword })
        });

        if (res.ok) {
            msgEl.textContent = 'Пароль успешно изменён! Теперь войдите с новым паролем.';
        } else {
            var errText = await res.text();
            msgEl.textContent = 'Ошибка при сбросе: ' + errText;
        }
    }

    async function recoverViaRecoveryCode(msgEl) {
        var username = prompt('Введите ваш логин:');
        if (!username) return;

        var { data: users, error } = await App.supabase.rpc('get_user_by_username', { p_username: username });
        if (error || !users || users.length === 0) {
            msgEl.textContent = 'Пользователь не найден';
            return;
        }
        var userData = users[0];

        var code = prompt('Введите резервный код:');
        if (!code) return;

        var { data: resetToken, error: tokenError } = await App.supabase.rpc('consume_recovery_code', {
            p_user_id: userData.id,
            p_code: code
        });
        if (tokenError || !resetToken) {
            msgEl.textContent = 'Неверный код или срок истёк';
            return;
        }

        var newPassword = prompt('Введите новый пароль (минимум 6 символов):');
        if (!newPassword || newPassword.length < 6) {
            msgEl.textContent = 'Пароль должен содержать не менее 6 символов';
            return;
        }

        var res = await fetch('https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/secure-reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reset_token: resetToken, newPassword: newPassword })
        });

        if (res.ok) {
            msgEl.textContent = 'Пароль успешно изменён! Теперь войдите с новым паролем.';
        } else {
            var errText = await res.text();
            msgEl.textContent = 'Ошибка при сбросе: ' + errText;
        }
    }

    async function generateAndShowRecoveryCodes(userId, username) {
        var codes = [];
        for (var i = 0; i < 8; i++) {
            var code = Array.from({length: 8}, () => Math.floor(Math.random() * 10)).join('');
            codes.push(code);
            await App.supabase.from('recovery_codes').insert({
                user_id: userId,
                code_hash: code
            });
        }
        var msg = 'Ваши резервные коды для восстановления доступа (сохраните их!):\n\n' +
                  codes.join('\n');
        alert(msg);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();
