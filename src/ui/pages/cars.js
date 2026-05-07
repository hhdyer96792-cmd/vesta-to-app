// src/ui/pages/cars.js
window.App = window.App || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.renderCarSelector = function() {
    var container = document.getElementById('car-selector-container');
    if (!container) return;
    var html = '<select id="car-select"><option value="">-- Выберите авто --</option>';
    App.store.cars.forEach(function(car) {
        var selected = car.id == App.store.activeCarId ? ' selected' : '';
        html += '<option value="' + car.id + '"' + selected + '>' + App.utils.escapeHtml(car.name) + '</option>';
    });
    html += '</select>';
    html += ' <button id="add-car-btn" class="icon-btn"><i data-lucide="plus"></i></button>';
    html += ' <button id="invite-btn" class="icon-btn" title="Пригласить"><i data-lucide="user-plus"></i></button>';
    html += ' <button id="rename-car-btn" class="icon-btn" title="Переименовать"><i data-lucide="pencil"></i></button>';
    html += ' <button id="delete-car-btn" class="icon-btn" title="Удалить автомобиль"><i data-lucide="trash-2"></i></button>';
    html += ' <button id="calendar-subscribe-btn" class="icon-btn" title="Подписка на календарь"><i data-lucide="calendar-days"></i></button>';
    container.innerHTML = html;

    document.getElementById('car-select').addEventListener('change', function() {
        var carId = this.value;
        if (carId) {
            App.store.setActiveCar(carId);
            if (App.realtime && App.realtime.subscribeToCar) {
                App.realtime.subscribeToCar(carId);
            }
            App.storage.loadAllData().then(function() {
                if (typeof App.renderAll === 'function') App.renderAll();
            });
            var sidebarSelect = document.getElementById('sidebar-car-select');
            if (sidebarSelect) sidebarSelect.value = carId;
        }
    });

    document.getElementById('add-car-btn').addEventListener('click', function() {
        var name = prompt('Название автомобиля:', 'Мой автомобиль');
        if (!name) return;
        App.supa.createCar(name).then(function(res) {
            var car = res.data;
            if (!car) {
                console.warn('createCar вернул пустой ответ, перезагружаем список');
                return App.store.loadCars().then(function() {
                    App.ui.pages.renderCarSelector();
                });
            }
            App.store.cars.push(car);
            App.store.setActiveCar(car.id);
            App.ui.pages.renderCarSelector();
            if (App.realtime && App.realtime.subscribeToCar) {
                App.realtime.subscribeToCar(car.id);
            }
            App.storage.loadAllData().then(function() {
                if (typeof App.renderAll === 'function') App.renderAll();
            });
            App.toast('Автомобиль добавлен', 'success');
        }).catch(function(err) {
            console.error(err);
            App.toast('Ошибка создания авто', 'error');
        });
    });

    document.getElementById('rename-car-btn').addEventListener('click', async function() {
        var carId = App.store.activeCarId;
        if (!carId) { App.toast('Нет выбранного автомобиля', 'warning'); return; }

        var userId = await App.supa.getCurrentUserId();
        var car = App.store.cars.find(c => c.id == carId);
        if (!car || car.user_id !== userId) {
            App.toast('Только владелец может переименовывать автомобиль', 'warning');
            return;
        }

        var currentName = car.name || '';
        var newName = prompt('Новое название:', currentName);
        if (!newName || newName === currentName) return;
        try {
            await App.supa.renameCar(carId, newName);
            car.name = newName;
            App.ui.pages.renderCarSelector();
            App.toast('Название обновлено', 'success');
        } catch (err) {
            console.error(err);
            App.toast('Ошибка переименования', 'error');
        }
    });

    document.getElementById('delete-car-btn').addEventListener('click', async function() {
        var carId = App.store.activeCarId;
        if (!carId) { App.toast('Нет выбранного автомобиля', 'warning'); return; }

        var userId = await App.supa.getCurrentUserId();
        var car = App.store.cars.find(c => c.id == carId);
        if (!car || car.user_id !== userId) {
            App.toast('Только владелец может удалять автомобиль', 'warning');
            return;
        }

        if (!confirm('Удалить автомобиль и все его данные? Это действие необратимо.')) return;
        try {
            await App.supa.deleteCar(carId);
            App.store.cars = App.store.cars.filter(c => c.id != carId);
            App.store.activeCarId = null;
            App.ui.pages.renderCarSelector();
            App.store.operations = [];
            App.store.fuelLog = [];
            App.store.tireLog = [];
            App.store.parts = [];
            App.store.serviceRecords = [];
            App.store.mileageHistory = [];
            App.store.saveToLocalStorage();
            if (typeof App.renderAll === 'function') App.renderAll();
            App.toast('Автомобиль удалён', 'success');
        } catch (err) {
            console.error(err);
            App.toast('Ошибка удаления', 'error');
        }
    });

    document.getElementById('invite-btn').addEventListener('click', function() {
        var carId = App.store.activeCarId;
        if (!carId) { App.toast('Сначала выберите авто', 'warning'); return; }

        App.supabase.from('car_shares')
            .insert({ car_id: carId, invited_email: null })
            .select()
            .single()
            .then(function(res) {
                if (res.error) throw res.error;
                var inviteCode = res.data.invite_code;
                var inviteLink = window.location.origin + '/Car-K3eper/?invite=' + inviteCode;
                var copyHtml = '<div style="margin-top:12px;">' +
                    '<p class="hint">Ссылка для приглашения:</p>' +
                    '<input type="text" value="' + inviteLink + '" readonly style="width:100%;" id="invite-link-input">' +
                    '<button id="copy-invite-link-btn" class="primary-btn" style="margin-top:8px;">Копировать</button>' +
                    '</div>';
                var modal = App.ui.createModal('Пригласить пользователя', copyHtml);
                document.getElementById('copy-invite-link-btn').addEventListener('click', function() {
                    var input = document.getElementById('invite-link-input');
                    input.select();
                    document.execCommand('copy');
                    App.toast('Ссылка скопирована в буфер обмена', 'success');
                });
            }).catch(function(err) {
                console.error(err);
                App.toast('Ошибка создания приглашения', 'error');
            });
    });

    document.getElementById('calendar-subscribe-btn').addEventListener('click', async function() {
        var carId = App.store.activeCarId;
        if (!carId) { App.toast('Сначала выберите авто', 'warning'); return; }

        var { data: existing, error: selectError } = await App.supabase
            .from('calendar_tokens')
            .select('token')
            .eq('car_id', carId)
            .maybeSingle();

        if (selectError) {
            console.error('Ошибка проверки токена:', selectError);
            App.toast('Ошибка получения токена', 'error');
            return;
        }

        var token;
        if (existing && existing.token) {
            token = existing.token;
        } else {
            var newToken = crypto.randomUUID();
            var { data: inserted, error: insertError } = await App.supabase
                .from('calendar_tokens')
                .insert({ car_id: carId, token: newToken })
                .select('token')
                .single();

            if (insertError) {
                console.error('Ошибка создания токена:', insertError);
                App.toast('Ошибка создания токена', 'error');
                return;
            }
            token = inserted.token;
        }

        var feedUrl = `https://qbjlccdqaudyvedpysil.supabase.co/functions/v1/calendar-feed?token=${token}`;
        var copyHtml = '<div style="margin-top:12px;">' +
            '<p class="hint">Скопируйте ссылку и добавьте в свой календарь как интернет-календарь:</p>' +
            '<input type="text" value="' + feedUrl + '" readonly style="width:100%;" id="calendar-feed-url">' +
            '<button id="copy-feed-url-btn" class="primary-btn" style="margin-top:8px;">Копировать</button>' +
            '</div>';
        var modal = App.ui.createModal('Подписка на календарь', copyHtml);
        document.getElementById('copy-feed-url-btn').addEventListener('click', function() {
            var input = document.getElementById('calendar-feed-url');
            input.select();
            document.execCommand('copy');
            App.toast('Ссылка скопирована', 'success');
        });
    });

    // Дублируем селектор в сайдбар
    var sidebarContainer = document.getElementById('sidebar-car-selector');
    if (sidebarContainer) {
        var sidebarHtml = '<select id="sidebar-car-select">' +
            '<option value="">-- Выберите авто --</option>';
        App.store.cars.forEach(function(car) {
            var selected = car.id == App.store.activeCarId ? ' selected' : '';
            sidebarHtml += '<option value="' + car.id + '"' + selected + '>' + App.utils.escapeHtml(car.name) + '</option>';
        });
        sidebarHtml += '</select>';
        sidebarContainer.innerHTML = sidebarHtml;

        document.getElementById('sidebar-car-select').addEventListener('change', function() {
            var carId = this.value;
            if (carId) {
                App.store.setActiveCar(carId);
                if (App.realtime && App.realtime.subscribeToCar) {
                    App.realtime.subscribeToCar(carId);
                }
                App.storage.loadAllData().then(function() {
                    if (typeof App.renderAll === 'function') App.renderAll();
                });
                var mainSelect = document.getElementById('car-select');
                if (mainSelect) mainSelect.value = carId;
            }
        });
    }

    App.initIcons();
};

App.ui.pages.checkPendingInvites = function() {
    var urlParams = new URLSearchParams(window.location.search);
    var inviteCode = urlParams.get('invite');

    // Если не авторизован, сохраним код в sessionStorage и вернёмся после входа
    if (inviteCode && !App.supabase.auth.getUser()) {
        sessionStorage.setItem('pendingInvite', inviteCode);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // Обработка invite из URL
    if (inviteCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
        App.supa.getInviteByCode(inviteCode).then(function({ data, error }) {
            if (error || !data) {
                App.toast('Приглашение не найдено', 'error');
                return;
            }
            if (data.accepted) {
                App.toast('Приглашение уже принято', 'warning');
                return;
            }
            var carName = data.cars ? data.cars.name : 'автомобиль';
            if (confirm(`Вас пригласили в автомобиль "${carName}". Принять?`)) {
                // Важно: acceptInvite принимает ID записи приглашения, а не invite_code
                App.supa.acceptInvite(data.id).then(function() {
                    App.toast('Приглашение принято!', 'success');
                    // Устанавливаем этот автомобиль как активный
                    App.store.setActiveCar(data.car_id);
                    App.store.loadCars().then(function() {
                        App.ui.pages.renderCarSelector();
                        App.storage.loadAllData();
                    });
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка принятия приглашения', 'error');
                });
            }
        });
        return;
    }

    // Проверяем сохранённый в sessionStorage код (после входа)
    var pendingInvite = sessionStorage.getItem('pendingInvite');
    if (pendingInvite) {
        sessionStorage.removeItem('pendingInvite');
        // Симулируем параметр URL, чтобы обработать ниже
        window.history.replaceState({}, document.title, window.location.pathname + '?invite=' + pendingInvite);
        App.ui.pages.checkPendingInvites();
        return;
    }

    // Стандартные ожидающие приглашения (уже привязанные к пользователю)
    App.supa.getPendingInvites().then(function({ data, error }) {
        if (error || !data || data.length === 0) return;
        data.forEach(function(inv) {
            var carName = inv.cars ? inv.cars.name : 'автомобиль';
            if (confirm(`Вас пригласили в автомобиль "${carName}". Принять?`)) {
                App.supa.acceptInvite(inv.id).then(function() {
                    App.toast('Приглашение принято!', 'success');
                    App.store.setActiveCar(inv.car_id);
                    App.store.loadCars().then(function() {
                        App.ui.pages.renderCarSelector();
                        App.storage.loadAllData();
                    });
                }).catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка принятия приглашения', 'error');
                });
            } else {
                App.supa.declineInvite(inv.id);
            }
        });
    });
};
