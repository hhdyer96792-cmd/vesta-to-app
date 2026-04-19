// ==================== 1. КОНФИГУРАЦИЯ ====================
// Идентификатор клиента Google OAuth (замените на свой)
const CLIENT_ID = '593689755085-9llh88kf9pvedbcpfumifq4gkj0kh248.apps.googleusercontent.com';
// Запрашиваемые разрешения: таблицы, календарь, диск
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file';
// Ключи для localStorage (кэш и офлайн-действия)
const CACHE_KEY = 'vesta_to_cache';
const PENDING_KEY = 'vesta_pending_actions';
// URL авторизации Google
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ==================== 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let accessToken = null;          // Токен доступа Google API
let spreadsheetId = '';          // ID текущей Google-таблицы
let driveFolderId = null;        // ID папки на Google Диске для фото

let operations = [];             // Список операций ТО
let parts = [];                  // Каталог запчастей
let fuelLog = [];                // Журнал заправок
let tireLog = [];                // Журнал шин
let workCosts = [];              // Затраты на работы
let serviceRecords = [];         // История выполненных ТО

let settings = {                 // Основные настройки
    currentMileage: 0,           // Текущий пробег
    currentMotohours: 0,         // Текущие моточасы
    avgDailyMileage: 45,         // Средний пробег в день
    avgDailyMotohours: 1.8,      // Средние моточасы в день
    telegramToken: '',           // Токен Telegram-бота
    telegramChatId: '',          // ID чата Telegram
    notificationMethod: 'telegram' // Способ уведомлений
};

let isOnline = navigator.onLine;      // Статус соединения
let pendingActions = [];              // Офлайн-действия

// ==================== 2-А. НОВЫЕ ПЕРЕМЕННЫЕ ====================
let mileageHistory = [];         // История изменения пробега и моточасов
let baseMileage = 0;             // Пробег на момент покупки
let baseMotohours = 0;           // Моточасы на момент покупки
let purchaseDate = '';           // Дата покупки (ГГГГ-ММ-ДД)
let ownershipDays = 0;           // Количество дней владения
let ownershipDisplayMode = 'days'; // Режим отображения: 'days' или 'years'

// ==================== 2-Б. ПРОФИЛИ АВТОМОБИЛЕЙ ====================
let carProfiles = [];            // Массив профилей {id, name, lastUsed}
let currentProfileId = '';       // ID текущего профиля
const PROFILES_KEY = 'vesta_car_profiles'; // Ключ localStorage
// ==================== 3. DOM ЭЛЕМЕНТЫ ====================
// Панели и кнопки
const authPanel = document.getElementById('auth-panel');
const authBtn = document.getElementById('authorize-btn');
const authStatus = document.getElementById('auth-status');
const dataPanel = document.getElementById('data-panel');
const syncIndicator = document.getElementById('sync-indicator');
const themeToggle = document.getElementById('theme-toggle');

// Показатели на главной
const displayMileage = document.getElementById('display-mileage');
const displayMotohours = document.getElementById('display-motohours');
const displayAvgMileage = document.getElementById('display-avg-mileage');
const displayAvgMotohours = document.getElementById('display-avg-motohours');

// Кнопки действий
const addOperationBtn = document.getElementById('add-operation-btn');
const recalculateBtn = document.getElementById('recalculate-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');

// Тела таблиц
const tableBody = document.getElementById('table-body');      // ТО
const partsBody = document.getElementById('parts-body');      // Запчасти
const fuelBody = document.getElementById('fuel-body');        // Топливо
const tiresBody = document.getElementById('tires-body');      // Шины
const historyBody = document.getElementById('history-body');  // История

// Кнопки добавления
const addFuelBtn = document.getElementById('add-fuel-btn');
const voiceFuelBtn = document.getElementById('voice-fuel-btn');
const addTireBtn = document.getElementById('add-tire-btn');
const addPartBtn = document.getElementById('add-part-btn');

// Поля ввода в настройках
const setMileage = document.getElementById('set-mileage');
const setMotohours = document.getElementById('set-motohours');
const setAvgMileage = document.getElementById('set-avg-mileage');
const setAvgMotohours = document.getElementById('set-avg-motohours');
const telegramTokenInput = document.getElementById('telegram-token');
const telegramChatIdInput = document.getElementById('telegram-chatid');
const notificationMethodSelect = document.getElementById('notification-method');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsResult = document.getElementById('settings-result');

// Уведомления и фото
const subscribePushBtn = document.getElementById('subscribe-push-btn');
const pushStatus = document.getElementById('push-status');
const openPhotoFolderBtn = document.getElementById('open-photo-folder-btn');
const shareTableBtn = document.getElementById('share-table-btn');

// Элементы графиков и статистики
const oilChart = document.getElementById('oilChart');
const costsChart = document.getElementById('costsChart');
const fuelChart = document.getElementById('fuelChart');
const totalMaintenanceCostEl = document.getElementById('total-maintenance-cost');
const totalFuelCostEl = document.getElementById('total-fuel-cost');
const costPerKmEl = document.getElementById('cost-per-km');
const avgFuelConsumptionEl = document.getElementById('avg-fuel-consumption');
const avgMileagePerDayEl = document.getElementById('avg-mileage-per-day');
const avgMotohoursPerDayEl = document.getElementById('avg-motohours-per-day');
const ownershipDisplay = document.getElementById('ownership-display');
const ownershipUnit = document.getElementById('ownership-unit');
const toggleOwnershipUnitBtn = document.getElementById('toggle-ownership-unit');

// ==================== 4. АВТОРИЗАЦИЯ ====================
/**
 * Запускает OAuth2-поток: перенаправляет на страницу Google.
 * Формирует URL с client_id, redirect_uri, scope и response_type=token.
 */
function startAuth() {
    const redirectUri = window.location.origin + window.location.pathname;
    const cleanRedirectUri = redirectUri.replace(/\/$/, '');
    const authUrl = `${AUTH_URL}?` +
        `client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(cleanRedirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&prompt=select_account`;
    window.location.href = authUrl;
}

/**
 * Проверяет наличие access_token в URL (фрагмент #access_token=...).
 * Если найден – сохраняет в sessionStorage, скрывает панель авторизации,
 * загружает последний использованный профиль или открывает модалку выбора авто.
 * @returns {boolean} true, если токен был извлечён
 */
function checkTokenInUrl() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
        accessToken = token;
        sessionStorage.setItem('vesta_token', accessToken);
        window.location.hash = '';
        authStatus.textContent = '✅ Авторизован';
        authPanel.style.display = 'none';
        setSyncStatus('synced');
        const lastId = getLastUsedProfileId();
        if (lastId) {
            spreadsheetId = lastId;
            loadSheet();
            addOrUpdateProfile(lastId);
        } else {
            openCarSelectModal();
        }
        return true;
    }
    return false;
}

/**
 * Инициализирует Google API: сначала проверяет токен в URL,
 * затем загружает сохранённый токен из sessionStorage.
 * Если токена нет – показывает панель авторизации.
 */
function initGoogleApi() {
    if (checkTokenInUrl()) return;
    const savedToken = sessionStorage.getItem('vesta_token');
    if (savedToken) {
        accessToken = savedToken;
        authStatus.textContent = '✅ Авторизован';
        authPanel.style.display = 'none';
        setSyncStatus('synced');
        const lastId = getLastUsedProfileId();
        if (lastId) {
            spreadsheetId = lastId;
            loadSheet();
        } else {
            openCarSelectModal();
        }
        return;
    }
    authPanel.style.display = 'block';
}

// ==================== 4-А. РАБОТА С ПРОФИЛЯМИ ====================
/** Загружает массив carProfiles из localStorage */
function loadProfiles() {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
        try { carProfiles = JSON.parse(stored); } catch (e) { carProfiles = []; }
    }
    carProfiles.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

/** Сохраняет carProfiles в localStorage */
function saveProfiles() {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(carProfiles));
}

/**
 * Добавляет или обновляет профиль автомобиля.
 * @param {string} id - ID Google-таблицы
 * @param {string} [name] - Отображаемое имя
 */
function addOrUpdateProfile(id, name = null) {
    const existing = carProfiles.find(p => p.id === id);
    const now = Date.now();
    if (existing) {
        existing.lastUsed = now;
        if (name) existing.name = name;
    } else {
        carProfiles.push({ id: id, name: name || 'Мой автомобиль', lastUsed: now });
    }
    carProfiles.sort((a, b) => b.lastUsed - a.lastUsed);
    saveProfiles();
    currentProfileId = id;
}

/** Возвращает ID последнего использованного профиля или null */
function getLastUsedProfileId() {
    loadProfiles();
    return carProfiles.length > 0 ? carProfiles[0].id : null;
}

/**
 * Загружает данные по выбранному профилю.
 * @param {string} id - ID таблицы
 */
async function loadProfileById(id) {
    if (!id) return;
    spreadsheetId = id;
    currentProfileId = id;
    await loadSheet();
    addOrUpdateProfile(id);
}

// ==================== 5. УТИЛИТЫ API ====================
/**
 * Универсальная функция для вызовов Google API.
 * Добавляет Bearer-токен в заголовок Authorization.
 * При 401 (просрочен токен) очищает сессию и показывает панель авторизации.
 * @param {string} url - URL запроса
 * @param {object} options - стандартные fetch-опции
 * @returns {Promise<object>} - JSON-ответ
 */
async function apiCall(url, options = {}) {
    if (!accessToken) throw new Error('Not authorized');
    const res = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        if (res.status === 401) {
            sessionStorage.removeItem('vesta_token');
            accessToken = null;
            authPanel.style.display = 'block';
            throw new Error('Требуется повторная авторизация');
        }
        throw new Error(`API error: ${res.status}`);
    }
    return res.json();
}

/**
 * Читает диапазон из текущей Google-таблицы.
 * @param {string} range - A1-нотация (например "Журнал ТО!A2:H")
 * @returns {Promise<array[]>} - массив строк
 */
async function readSheet(range) {
    const data = await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`);
    return data.values || [];
}

/**
 * Перезаписывает диапазон в Google-таблице.
 * @param {string} range - A1-нотация
 * @param {array[]} values - двумерный массив данных
 */
async function writeSheet(range, values) {
    await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values }),
    });
}

/**
 * Добавляет строки в конец диапазона.
 * @param {string} range - A1-нотация (например "FuelLog!A:G")
 * @param {array[]} values - данные для добавления
 */
async function appendSheet(range, values) {
    await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values }),
    });
}

// ==================== 6. ИНДИКАТОР СИНХРОНИЗАЦИИ ====================
/**
 * Меняет внешний вид иконки синхронизации.
 * @param {string} status - "synced", "syncing" или "error"
 */
function setSyncStatus(status) {
    syncIndicator.className = status;
    syncIndicator.title = status === 'synced' ? 'Синхронизировано' : status === 'syncing' ? 'Синхронизация...' : 'Ошибка соединения';
}

// ==================== 7. ЗАГРУЗКА ДАННЫХ ====================
/**
 * Основная функция загрузки всей информации из Google Sheets.
 * Загружает: операции ТО, настройки, запчасти, шины, работы, историю пробега.
 * При ошибке пробует взять данные из localStorage (кэш).
 */
async function loadSheet() {
    if (!spreadsheetId) return;
    localStorage.setItem('vesta_spreadsheet_id', spreadsheetId);
    setSyncStatus('syncing');
    try {
        // Параллельные запросы к разным листам
        const [opsData, settingsData, partsData, tiresData, workCostsData] = await Promise.all([
            readSheet('Журнал ТО!A2:H'),
            readSheet('Журнал ТО!Q1:Q8'),
            readSheet('PartsCatalog!A2:G').catch(() => []),
            readSheet('Tires!A2:J').catch(() => []),
            readSheet('WorkCosts!A2:D').catch(() => [])
        ]);

        // Парсим операции ТО
        operations = opsData.filter(r => r[1]).map((r, i) => {
            let lastDate = null;
            if (r[2]) { const p = new Date(r[2]); lastDate = isNaN(p) ? null : p.toISOString().split('T')[0]; }
            return {
                id: i+2, rowIndex: i+2, category: r[0]||'', name: r[1],
                intervalKm: +r[5]||0, intervalMonths: +r[6]||0, intervalMotohours: r[7]?+r[7]:null,
                lastDate, lastMileage: +r[3]||0, lastMotohours: +r[4]||0
            };
        });

        // Настройки (строки Q1:Q8)
        if (settingsData.length >= 8) {
            settings.currentMileage = +settingsData[0][0]||0;
            settings.currentMotohours = +settingsData[1][0]||0;
            settings.avgDailyMileage = +settingsData[2][0]||45;
            settings.avgDailyMotohours = +settingsData[3][0]||1.8;
            settings.telegramToken = settingsData[6]?.[0]||'';
            settings.telegramChatId = settingsData[7]?.[0]||'';
        }

        // Каталог запчастей
        parts = partsData.map((r,i)=>({
            id:i+2, operation:r[0]||'', oem:r[1]||'', analog:r[2]||'',
            price:r[3]||'', supplier:r[4]||'', link:r[5]||'', comment:r[6]||''
        }));

        // Журнал топлива
        const fuelData = await readSheet('FuelLog!A2:G').catch(()=>[]);
        fuelLog = fuelData.map(r=>({
            date: typeof r[0]==='number'?excelDateToISO(r[0]):r[0], mileage:+r[1], liters:+r[2],
            pricePerLiter:+r[3], fullTank:r[4], fuelType:r[5]||'Бензин', notes:r[6]
        })).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

        // Шины (расширенный формат до 10 колонок)
        tireLog = tiresData.map(r=>({
            date: typeof r[0]==='number'?excelDateToISO(r[0]):r[0], type:r[1]||'', mileage:+r[2]||0,
            model:r[3]||'', size:r[4]||'', wear:r[5]||'', notes:r[6]||'',
            purchaseCost:+r[7]||0, mountCost:+r[8]||0, isDIY:r[9]==='TRUE'||r[9]===true
        })).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

        // Затраты на работы
        workCosts = workCostsData.map(r=>({ operationId:+r[0], cost:+r[1], isDIY:r[2]==='TRUE', notes:r[3] }));

        // История пробега и моточасов
        const mileageData = await readSheet('MileageLog!A2:C').catch(()=>[]);
        mileageHistory = mileageData.map(r=>({ date:r[0], mileage:+r[1], motohours:+r[2] }))
            .sort((a,b)=>new Date(a.date)-new Date(b.date));

        // Дополнительные настройки (точка отсчёта, дата покупки)
        const extraSettings = await readSheet('Журнал ТО!Q9:Q12').catch(()=>[]);
        if (extraSettings.length>=4) {
            baseMileage = +extraSettings[0][0]||0;
            baseMotohours = +extraSettings[1][0]||0;
            purchaseDate = extraSettings[2]?.[0]||'';
        }
        calculateOwnershipDays();

        // Сохраняем кэш и отрисовываем
        localStorage.setItem(CACHE_KEY, JSON.stringify({ operations, settings, parts, fuelLog, tireLog, workCosts }));
        renderAll();
        dataPanel.style.display = 'block';
        setSyncStatus('synced');
        syncPendingActions();
        driveFolderId = await getOrCreatePhotoFolder();
        loadHistory();
        addOrUpdateProfile(spreadsheetId);
    } catch (e) {
        setSyncStatus('error');
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const d = JSON.parse(cached);
            operations=d.operations; settings=d.settings; parts=d.parts||[];
            fuelLog=d.fuelLog||[]; tireLog=d.tireLog||[]; workCosts=d.workCosts||[];
            renderAll(); dataPanel.style.display = 'block';
        }
    }
}

// ==================== 8. РАСЧЁТ ПЛАНОВ ====================
/**
 * Возвращает интервал замены масла в моточасах в зависимости от средней скорости.
 * Если средняя скорость < 20 км/ч (городской цикл) → 200 м/ч, иначе 250 м/ч.
 * Для остальных операций возвращает стандартный интервал из операции.
 */
function getOilMotohoursInterval(op, avgSpeed) {
    if (op.name.includes('Масло') && op.category.includes('ДВС')) return avgSpeed < 20 ? 200 : 250;
    return op.intervalMotohours;
}

/**
 * Рассчитывает план по операции: дату следующего ТО, пробег, моточасы, дни до плана.
 * Учитывает интервалы по пробегу, месяцам и моточасам (с коррекцией для масла).
 * @param {object} op - операция ТО
 * @returns {object} - { recDate, recMileage, recMotohours, planDate, planMileage, daysLeft }
 */
function calculatePlan(op) {
    const today = new Date(); today.setHours(0,0,0,0);
    let recDate = new Date(8640000000000000);
    if (op.intervalMonths) {
        recDate = op.lastDate ? new Date(op.lastDate) : new Date(today);
        recDate.setMonth(recDate.getMonth() + op.intervalMonths);
    }
    const recMileage = op.lastMileage ? op.lastMileage + op.intervalKm : op.intervalKm;
    const avgSpeed = settings.avgDailyMileage / settings.avgDailyMotohours;
    const motoInterval = getOilMotohoursInterval(op, avgSpeed);
    let isMotohoursFresh = true;
    if (op.name.includes('Масло') && op.category.includes('ДВС')) {
        if (mileageHistory.length >= 1) {
            const last = mileageHistory[mileageHistory.length-1];
            if ((settings.currentMotohours - last.motohours) > 20 || (settings.currentMileage - last.mileage) > 500) isMotohoursFresh = false;
        }
    }
    let recMotohours = null;
    if (motoInterval && isMotohoursFresh) {
        recMotohours = op.lastMotohours ? op.lastMotohours + motoInterval : settings.currentMotohours + motoInterval;
    }
    let dateByMileage = new Date(8640000000000000);
    if (recMileage > settings.currentMileage && settings.avgDailyMileage > 0) {
        const days = Math.ceil((recMileage - settings.currentMileage) / settings.avgDailyMileage);
        dateByMileage = new Date(today); dateByMileage.setDate(today.getDate() + days);
    }
    let dateByMoto = new Date(8640000000000000);
    if (recMotohours && recMotohours > settings.currentMotohours && settings.avgDailyMotohours > 0) {
        const days = Math.ceil((recMotohours - settings.currentMotohours) / settings.avgDailyMotohours);
        dateByMoto = new Date(today); dateByMoto.setDate(today.getDate() + days);
    }
    const planDate = new Date(Math.min(recDate, dateByMileage, dateByMoto));
    let daysLeft = Math.ceil((planDate - today) / 86400000);
    if (planDate.getFullYear() > 275000) daysLeft = 0;
    let planDateStr = planDate.getFullYear() < 275000 ? planDate.toISOString().split('T')[0] : '';
    return {
        recDate: recDate.getFullYear() < 275000 ? recDate.toISOString().split('T')[0] : '',
        recMileage,
        recMotohours: recMotohours || '',
        planDate: planDateStr,
        planMileage: recMileage,
        daysLeft: isFinite(daysLeft) ? daysLeft : 0
    };
}

// ==================== 9. ОТРИСОВКА ====================
/** Главная функция отрисовки: обновляет все показатели и таблицы */
function renderAll() {
    if (displayMileage) displayMileage.textContent = settings.currentMileage;
    if (displayMotohours) displayMotohours.textContent = settings.currentMotohours;
    if (displayAvgMileage) displayAvgMileage.textContent = settings.avgDailyMileage;
    if (displayAvgMotohours) displayAvgMotohours.textContent = settings.avgDailyMotohours;
    renderTOTable(); renderPartsTable(); renderFuelTable(); renderTiresTable(); renderStats(); renderTop5Widget();
    if (setMileage) setMileage.value = settings.currentMileage;
    if (setMotohours) setMotohours.value = settings.currentMotohours;
    if (setAvgMileage) setAvgMileage.value = settings.avgDailyMileage;
    if (setAvgMotohours) setAvgMotohours.value = settings.avgDailyMotohours;
    if (telegramTokenInput) telegramTokenInput.value = settings.telegramToken || '';
    if (telegramChatIdInput) telegramChatIdInput.value = settings.telegramChatId || '';
    if (notificationMethodSelect) notificationMethodSelect.value = settings.notificationMethod || 'telegram';
    const baseMileageInput = document.getElementById('set-base-mileage');
    if (baseMileageInput) baseMileageInput.value = baseMileage;
    const baseMotohoursInput = document.getElementById('set-base-motohours');
    if (baseMotohoursInput) baseMotohoursInput.value = baseMotohours;
    const purchaseDateInput = document.getElementById('purchase-date');
    if (purchaseDateInput) purchaseDateInput.value = purchaseDate;
    calculateOwnershipDays();
}

/** Отрисовывает таблицу ТО с группировкой по категориям и цветовой индикацией */
function renderTOTable() {
    const tbody = tableBody; if (!tbody) return;
    tbody.innerHTML = '';
    const grouped = {};
    operations.forEach(op => { if (!grouped[op.category]) grouped[op.category] = []; grouped[op.category].push(op); });
    const categories = Object.keys(grouped).sort((a,b) => a==='Прочее'?1:b==='Прочее'?-1:a.localeCompare(b));
    categories.forEach(cat => {
        const headerRow = document.createElement('tr');
        headerRow.style.background='#34495e'; headerRow.style.color='white';
        headerRow.innerHTML = `<td colspan="7" style="padding:8px; font-weight:bold;">${cat}</td>`;
        tbody.appendChild(headerRow);
        const opsInCat = grouped[cat].sort((a,b)=>calculatePlan(a).daysLeft - calculatePlan(b).daysLeft);
        opsInCat.forEach(op => {
            const plan = calculatePlan(op);
            let cls = '';
            if (isFinite(plan.daysLeft)) {
                if (plan.daysLeft<0) cls='overdue'; else if(plan.daysLeft<=10) cls='critical'; else if(plan.daysLeft<=20) cls='warning'; else if(plan.daysLeft<=30) cls='attention';
            }
            const tr = document.createElement('tr'); tr.className = cls; tr.dataset.rowIndex = op.rowIndex; tr.dataset.operationId = op.id;
            const cacheKey = `${op.name}|${plan.planDate}`;
            const isAdded = calendarEventCache.get(cacheKey) || false;
            const calendarIcon = isAdded ? '✅' : '📅';
            const calendarTitle = isAdded ? 'Уже в календаре' : 'Добавить в календарь';
            const calendarClass = isAdded ? 'calendar-btn calendar-btn-added' : 'calendar-btn';
            tr.innerHTML = `
                <td><strong>${op.name}</strong></td>
                <td>${op.lastDate ? op.lastDate.split('-').reverse().join('-') : '—'}</td>
                <td>${op.lastMileage||'—'}</td>
                <td>${op.lastMotohours||'—'}</td>
                <td><strong>${plan.planDate.split('-').reverse().join('-')}</strong><br><small>${plan.planMileage} км</small></td>
                <td>${plan.daysLeft < 0 ? `⚠️ ${Math.abs(plan.daysLeft)} дн.` : `${plan.daysLeft} дн.`}</td>
                <td>
                    <button class="icon-btn add-record-btn" data-op-id="${op.id}" data-op-name="${op.name}">➕</button>
                    <button class="icon-btn edit-op-btn" data-op-id="${op.id}">✏️</button>
                    <button class="icon-btn ${calendarClass}" data-op-name="${op.name}" data-plan-date="${plan.planDate}" data-plan-mileage="${plan.planMileage}" title="${calendarTitle}">${calendarIcon}</button>
                    <button class="icon-btn shopping-list-btn" data-op-id="${op.id}">🛒</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
    attachTOListeners();
    updateCalendarButtonsStatus();
}

/** Отрисовывает таблицу запчастей */
function renderPartsTable() {
    const tbody = partsBody; tbody.innerHTML = '';
    parts.forEach(p => {
        const tr = document.createElement('tr'); tr.dataset.id = p.id;
        tr.innerHTML = `<td>${p.operation}</td><td>${p.oem}</td><td>${p.analog}</td><td>${p.price ? p.price+' ₽' : ''}</td><td>${p.supplier}</td><td>${p.link ? `<a href="${p.link}" target="_blank">🔗</a>` : ''}</td><td>${p.comment}</td>
            <td><button class="icon-btn edit-part-btn" data-id="${p.id}">✏️</button> <button class="icon-btn delete-part-btn" data-id="${p.id}">🗑️</button> <button class="icon-btn search-part-btn" data-oem="${p.oem}">🔍</button></td>`;
        tbody.appendChild(tr);
    });
    attachPartsListeners();
}

/** Отрисовывает таблицу топлива */
function renderFuelTable() {
    const tbody = fuelBody; tbody.innerHTML = '';
    fuelLog.forEach((f,i) => {
        if (!f.date) return;
        const tr = document.createElement('tr');
        const fullTankIcon = f.fullTank === 'TRUE' || f.fullTank === true ? '✅' : '';
        tr.innerHTML = `
            <td>${f.date}</td><td>${f.mileage||''}</td><td>${f.liters||''}</td><td>${f.pricePerLiter||''}</td>
            <td style="text-align:center;">${fullTankIcon}</td><td>${f.fuelType||''}</td><td>${f.notes||''}</td>
            <td><button class="icon-btn edit-fuel-btn" data-index="${i}">✏️</button> <button class="icon-btn delete-fuel-btn" data-index="${i}">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    attachFuelListeners();
}

/** Отрисовывает таблицу шин с колонками модель, размер, износ */
function renderTiresTable() {
    const tbody = tiresBody; tbody.innerHTML = '';
    tireLog.forEach((t,i) => {
        if (!t.date) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td><td>${t.type||''}</td><td>${t.mileage||''}</td><td>${t.model||''}</td><td>${t.size||''}</td><td>${t.wear||''}</td><td>${t.notes||''}</td>
            <td><button class="icon-btn edit-tire-btn" data-index="${i}">✏️</button> <button class="icon-btn delete-tire-btn" data-index="${i}">🗑️</button></td>
        `;
        tbody.appendChild(tr);
    });
    attachTireListeners();
}

// ==================== 10. МОДАЛЬНЫЕ ОКНА ====================
/**
 * Создаёт модальное окно с заголовком и содержимым.
 * @param {string} title - заголовок окна
 * @param {string} content - HTML-содержимое
 * @returns {HTMLElement} - созданный модальный элемент
 */
function createModal(title, content) {
    const modal = document.createElement('div'); modal.className = 'modal'; modal.style.display = 'flex';
    modal.innerHTML = `<div class="modal-content"><span class="close">&times;</span><h3>${title}</h3>${content}</div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    return modal;
}

/** Маска ввода даты в формате ГГГГ-ММ-ДД (ISO) */
window.applyDateMaskISO = function(event) {
    let input = event.target, value = input.value.replace(/\D/g,''); if(value.length>8) value=value.slice(0,8);
    let formatted = ''; if(value.length>0){ formatted=value.substring(0,4); if(value.length>=5) formatted+='-'+value.substring(4,6); if(value.length>=7) formatted+='-'+value.substring(6,8); }
    input.value = formatted;
};

/** Маска ввода даты в формате ДД-ММ-ГГГГ (для удобства пользователя) */
window.applyDateMaskDDMMYYYY = function(event) {
    let input = event.target, value = input.value.replace(/\D/g,''); if(value.length>8) value=value.slice(0,8);
    let formatted = ''; if(value.length>0){ formatted=value.substring(0,2); if(value.length>=3) formatted+='-'+value.substring(2,4); if(value.length>=5) formatted+='-'+value.substring(4,8); }
    input.value = formatted;
};

/** Преобразует ДД-ММ-ГГГГ в ГГГГ-ММ-ДД */
function ddmmYYYYtoISO(dateStr) {
    if (!dateStr || !/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split('-'); return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/** Преобразует ГГГГ-ММ-ДД в ДД-ММ-ГГГГ */
function isoToDDMMYYYY(isoStr) {
    if (!isoStr || isoStr.length !== 10) return isoStr;
    const parts = isoStr.split('-'); return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Открывает модальное окно для добавления записи о выполненном ТО.
 * Поддерживает фото, затраты на запчасти и работы, а также автоматическое добавление связанных операций (масляный фильтр).
 * @param {number} opId - ID операции
 * @param {string} opName - название операции
 */
function openServiceModal(opId, opName) {
    const op = operations.find(o => o.id == opId);
    const isOsago = (op && op.category === 'Документы' && op.name.includes('ОСАГО'));
    const modal = createModal('➕ Выполнить ТО', `
        <form id="service-form" enctype="multipart/form-data">
            <input type="hidden" name="opId" value="${opId}"><p><strong>${opName}</strong></p>
            <label>Дата (ДД-ММ-ГГГГ)</label>
            <input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="applyDateMaskDDMMYYYY(event)">
            <label>Пробег, км</label><input type="number" name="mileage" value="${settings.currentMileage}">
            <label>Моточасы</label><input type="text" inputmode="decimal" name="motohours" value="${settings.currentMotohours}">
            ${isOsago ? `
                <label>Стоимость полиса, ₽</label><input type="number" name="cost" step="0.01">
                <label>Ссылка на файл (Google Drive)</label><input type="url" name="fileLink" placeholder="https://drive.google.com/...">
                <label>Срок действия (мес.)</label><input type="number" name="osagoMonths" value="12" min="1" max="12">
            ` : `
                <h4>🛠️ Запчасти</h4><label>Стоимость, ₽</label><input type="number" name="cost" step="0.01">
                <h4>🔧 Работы</h4><label>Стоимость, ₽</label><input type="number" name="workCost" step="0.01">
                <label><input type="checkbox" name="isDIY" value="true"> Сделал сам</label>
            `}
            <h4>📸 Фото</h4><input type="file" name="photo" accept="image/*" capture="environment">
            <label>Примечание</label><input type="text" name="notes">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#service-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        const data = new FormData(form), photo = data.get('photo');
        const currentOpName = opName, currentIsOsago = isOsago;
        modal.remove();
        (async () => {
            try {
                let photoUrl = ''; if (photo && photo.size > 0) photoUrl = await uploadPhoto(photo);
                const cost = data.get('cost')||'0', workCost = data.get('workCost')||'0', isDIY = data.get('isDIY')==='true';
                const notes = data.get('notes')||'', fileLink = data.get('fileLink')||'', osagoMonths = data.get('osagoMonths')||'12';
                const motohours = parseFloat(data.get('motohours'))||0;
                let formattedDate = ddmmYYYYtoISO(data.get('date'));
                let fullNotes = notes;
                if (currentIsOsago) fullNotes = `ОСАГО. Стоимость: ${cost} ₽. Срок: ${osagoMonths} мес. Ссылка: ${fileLink}. ` + notes;
                await addServiceRecord(data.get('opId'), formattedDate, data.get('mileage'), motohours, cost, workCost, isDIY, fullNotes, photoUrl);
                // Автоматическое добавление масляного фильтра при замене масла
                if (currentOpName === 'Масло') {
                    const filterOp = operations.find(o => o.name === 'Масляный фильтр' && o.category === 'ДВС');
                    if (filterOp && !serviceRecords.some(rec => rec.operation_id === filterOp.id && rec.date === formattedDate)) {
                        await addServiceRecord(filterOp.id, formattedDate, data.get('mileage'), motohours, 0, 0, false, 'Автоматически вместе с заменой масла', '');
                    }
                }
                // Автоматическое добавление фильтра вариатора при замене масла CVT
                if (currentOpName.includes('Масло CVT (частичная)')) {
                    const filterOp = operations.find(o => o.name.includes('Фильтр вариатора'));
                    if (filterOp && !serviceRecords.some(rec => rec.operation_id === filterOp.id && rec.date === formattedDate)) {
                        await addServiceRecord(filterOp.id, formattedDate, data.get('mileage'), motohours, 0, 0, false, 'Автоматически вместе с частичной заменой масла', '');
                    }
                }
            } catch (error) { console.error(error); alert('Ошибка сохранения'); }
        })();
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}
/**
 * Открывает форму для добавления или редактирования операции ТО.
 * @param {object|null} op - операция для редактирования (если null – создание новой)
 */
function openOperationForm(op = null) {
    const modal = createModal(op ? '✏️ Редактировать' : '➕ Новая операция', `
        <form id="op-form"><input type="hidden" name="id" value="${op?.id||''}"><input type="hidden" name="rowIndex" value="${op?.rowIndex||''}">
            <label>Категория</label>
            <select name="category" required>
                <option value="ДВС" ${op?.category==='ДВС'?'selected':''}>ДВС</option>
                <option value="Вариатор" ${op?.category==='Вариатор'?'selected':''}>Вариатор</option>
                <option value="Тормозная система" ${op?.category==='Тормозная система'?'selected':''}>Тормозная система</option>
                <option value="Подвеска" ${op?.category==='Подвеска'?'selected':''}>Подвеска</option>
                <option value="Зажигание" ${op?.category==='Зажигание'?'selected':''}>Зажигание</option>
                <option value="Охлаждение" ${op?.category==='Охлаждение'?'selected':''}>Охлаждение</option>
                <option value="ГРМ" ${op?.category==='ГРМ'?'selected':''}>ГРМ</option>
                <option value="Навесное" ${op?.category==='Навесное'?'selected':''}>Навесное</option>
                <option value="Трансмиссия" ${op?.category==='Трансмиссия'?'selected':''}>Трансмиссия</option>
                <option value="Топливная система" ${op?.category==='Топливная система'?'selected':''}>Топливная система</option>
                <option value="Сезонное" ${op?.category==='Сезонное'?'selected':''}>Сезонное</option>
                <option value="Документы" ${op?.category==='Документы'?'selected':''}>Документы</option>
                <option value="Прочее" ${op?.category==='Прочее'?'selected':''}>Прочее</option>
            </select>
            <label>Название</label><input type="text" name="name" value="${op?.name||''}" required>
            <label>Интервал, км</label><input type="number" name="km" value="${op?.intervalKm||''}">
            <label>Интервал, мес</label><input type="number" name="months" value="${op?.intervalMonths||''}">
            <label>Интервал, моточасов</label><input type="number" name="moto" value="${op?.intervalMotohours||''}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#op-form');
    form.onsubmit = (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(form)); modal.remove(); saveOperation(fd).catch(e=>console.warn(e)); };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

/**
 * Открывает модальное окно выбора/добавления автомобиля (профиля).
 * Позволяет переключаться между таблицами разных авто.
 */
function openCarSelectModal() {
    loadProfiles();
    let optionsHtml = '';
    carProfiles.forEach((p, i) => {
        optionsHtml += `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <input type="radio" name="carProfile" value="${p.id}" id="profile_${i}" ${p.id===currentProfileId?'checked':''}>
                <input type="text" id="name_${i}" value="${p.name}" style="flex:1; min-width:150px" placeholder="Имя авто">
                <button type="button" class="icon-btn delete-profile-btn" data-id="${p.id}">🗑️</button>
            </div>
        `;
    });
    const modal = createModal('🚗 Выбор автомобиля', `
        <form id="car-select-form">
            <div style="max-height:300px; overflow-y:auto; margin-bottom:16px;">${optionsHtml||'<p>Нет сохранённых автомобилей</p>'}</div>
            <div style="border-top:1px solid var(--border); padding-top:16px;">
                <label>Добавить новый автомобиль</label>
                <input type="text" id="new-profile-id" placeholder="ID таблицы Google Sheets" style="margin-bottom:8px;">
                <input type="text" id="new-profile-name" placeholder="Название (например, Vesta)" value="Мой автомобиль">
            </div>
            <div class="modal-actions"><button type="submit" class="primary-btn">Загрузить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    modal.querySelectorAll('.delete-profile-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.preventDefault(); const id = btn.dataset.id; carProfiles = carProfiles.filter(p => p.id !== id); saveProfiles(); modal.remove(); openCarSelectModal();
    }));
    const form = modal.querySelector('#car-select-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        const selectedRadio = form.querySelector('input[name="carProfile"]:checked');
        let selectedId;
        if (selectedRadio) {
            selectedId = selectedRadio.value;
            carProfiles.forEach((p, i) => { const inp = document.getElementById(`name_${i}`); if (inp) p.name = inp.value || p.name; });
            saveProfiles();
        } else {
            const newId = document.getElementById('new-profile-id').value.trim();
            const newName = document.getElementById('new-profile-name').value.trim() || 'Мой автомобиль';
            if (!newId) { alert('Введите ID'); return; }
            selectedId = newId; addOrUpdateProfile(selectedId, newName);
        }
        modal.remove(); loadProfileById(selectedId);
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

// ==================== 11. СОХРАНЕНИЕ ====================
/**
 * Добавляет запись о выполненном ТО в таблицу и историю.
 * При наличии интернета пишет напрямую в Google Sheets, иначе сохраняет в офлайн-очередь.
 * @param {number} opId - ID операции
 * @param {string} date - дата в формате ГГГГ-ММ-ДД
 * @param {number} mileage - пробег
 * @param {number} motohours - моточасы
 * @param {number} partsCost - стоимость запчастей
 * @param {number} workCost - стоимость работ
 * @param {boolean} isDIY - выполнено самостоятельно
 * @param {string} notes - примечание
 * @param {string} photoUrl - ссылка на фото в Google Drive
 */
async function addServiceRecord(opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl) {
    const op = operations.find(o => o.id == opId); if (!op) return;
    const values = [[date, mileage, motohours || '']];
    if (isOnline) {
        await writeSheet(`Журнал ТО!C${op.rowIndex}:E${op.rowIndex}`, values);
        await appendSheet('История!A:A', [[opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl, new Date().toISOString()]]);
        await appendSheet('WorkCosts!A:D', [[opId, workCost, isDIY, notes]]);
        sendNotification('✅ Выполнено ТО', `${op.name}\nПробег: ${mileage} км\nЗатраты: ${+partsCost + +workCost} ₽`);
        await loadSheet();
    } else {
        addPendingAction({ type: 'service', opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl, rowIndex: op.rowIndex });
        op.lastDate = date; op.lastMileage = +mileage; op.lastMotohours = +motohours;
        renderTOTable();
        localStorage.setItem(CACHE_KEY, JSON.stringify({ operations, settings, parts, fuelLog, tireLog, workCosts }));
    }
}

/**
 * Сохраняет операцию ТО (создание или редактирование) в таблицу.
 * @param {object} data - данные формы: category, name, km, months, moto, rowIndex, id
 */
async function saveOperation(data) {
    const category = data.category, name = data.name, km = data.km||'', months = data.months||'', moto = data.moto||'';
    const rowIndex = parseInt(data.rowIndex,10), id = data.id;
    const existingOp = operations.find(o => o.id == id);
    const lastDate = existingOp ? existingOp.lastDate||'' : '', lastMileage = existingOp ? existingOp.lastMileage||'' : '', lastMotohours = existingOp ? existingOp.lastMotohours||'' : '';
    const rowData = [category, name, lastDate, lastMileage, lastMotohours, km, months, moto];
    if (id && !isNaN(rowIndex) && rowIndex >= 2) {
        await writeSheet(`Журнал ТО!A${rowIndex}:H${rowIndex}`, [rowData]);
        const op = operations.find(o => o.id == id);
        if (op) { op.category=category; op.name=name; op.intervalKm=parseInt(km)||0; op.intervalMonths=parseInt(months)||0; op.intervalMotohours=moto?parseInt(moto):null; }
        renderTOTable();
        setTimeout(() => { loadSheet().catch(e=>console.warn(e)); }, 100);
    } else {
        await appendSheet('Журнал ТО!A:H', [rowData]);
        await loadSheet();
    }
}

// ==================== 12. ОФЛАЙН ====================
/** Добавляет действие в очередь офлайн-действий и помечает статус ошибки */
function addPendingAction(action) { pendingActions.push(action); localStorage.setItem(PENDING_KEY, JSON.stringify(pendingActions)); setSyncStatus('error'); }

/** Синхронизирует накопленные офлайн-действия при восстановлении соединения */
async function syncPendingActions() {
    if (!isOnline || !accessToken || pendingActions.length === 0) return;
    setSyncStatus('syncing');
    const actions = [...pendingActions];
    for (const a of actions) {
        try {
            if (a.type === 'service') {
                await writeSheet(`Журнал ТО!C${a.rowIndex}:E${a.rowIndex}`, [[a.date, a.mileage, a.motohours]]);
                await appendSheet('История!A:A', [[a.opId, a.date, a.mileage, a.motohours, a.partsCost, a.workCost, a.isDIY, a.notes, a.photoUrl, new Date().toISOString()]]);
                await appendSheet('WorkCosts!A:D', [[a.opId, a.workCost, a.isDIY, a.notes]]);
            }
            pendingActions = pendingActions.filter(act => act !== a);
        } catch (e) { console.warn(e); }
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingActions));
    if (pendingActions.length === 0) setSyncStatus('synced');
    await loadSheet();
}

// ==================== 13. ФОТО ====================
/** Создаёт или возвращает ID папки "Vesta_TO_Photos" на Google Диске */
async function getOrCreatePhotoFolder() {
    const query = encodeURIComponent("name='Vesta_TO_Photos' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const res = await apiCall(`https://www.googleapis.com/drive/v3/files?q=${query}`);
    if (res.files.length) return res.files[0].id;
    const metadata = { name: 'Vesta_TO_Photos', mimeType: 'application/vnd.google-apps.folder' };
    const createRes = await apiCall('https://www.googleapis.com/drive/v3/files', { method:'POST', body:JSON.stringify(metadata) });
    return createRes.id;
}

/** Загружает фото на Google Диск и возвращает публичную ссылку */
async function uploadPhoto(file) {
    const metadata = { name: `${new Date().toISOString()}_${file.name}`, mimeType: file.type, parents: [driveFolderId] };
    const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(metadata)], {type:'application/json'})); form.append('file', file);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method:'POST', headers:{Authorization:`Bearer ${accessToken}`}, body:form });
    const data = await res.json(); return `https://drive.google.com/file/d/${data.id}/view`;
}

// ==================== 14. УВЕДОМЛЕНИЯ ====================
/** Отправляет уведомление выбранным способом (telegram/push/both) */
async function sendNotification(title, body, tag=null) {
    if (settings.notificationMethod==='telegram'||settings.notificationMethod==='both') await sendTelegramMessage(`${title}\n${body}`);
    if (settings.notificationMethod==='push'||settings.notificationMethod==='both') await sendPushNotification(title, body, tag);
}

/** Отправляет сообщение в Telegram */
async function sendTelegramMessage(text) {
    if (!settings.telegramToken || !settings.telegramChatId) return;
    try { await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ chat_id:settings.telegramChatId, text }) }); } catch(e){}
}

/** Отправляет push-уведомление через Service Worker */
async function sendPushNotification(title, body, tag) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready; await reg.showNotification(title, { body, tag, icon:'icon-192.png' });
}

/** Подписывает пользователя на push-уведомления (запрашивает разрешение) */
async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert('Push не поддерживается'); return; }
    const perm = await Notification.requestPermission(); if (perm!=='granted') { alert('Нет разрешения'); return; }
    localStorage.setItem('push_subscribed','true'); pushStatus.textContent = '✅ Push активны';
}

// ==================== 15. ГОЛОС, ТОПЛИВО, ШИНЫ ====================
/** Запускает голосовое распознавание для быстрого добавления заправки */
function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { alert('Не поддерживается'); return; }
    const rec = new SR(); rec.lang='ru-RU'; rec.interimResults=false; rec.start();
    rec.onresult = (e) => parseFuelVoice(e.results[0][0].transcript);
    rec.onerror = (e) => alert(e.error==='not-allowed'?'Доступ к микрофону запрещён.':'Ошибка распознавания: '+e.error);
}

/** Разбирает голосовую фразу: ожидает "пробег литры [цена]" */
function parseFuelVoice(text) {
    const nums = text.match(/\d+(?:[.,]\d+)?/g); if (!nums||nums.length<2) { alert('Скажите пробег и литры'); return; }
    openFuelModal({ mileage:parseInt(nums[0]), liters:parseFloat(nums[1]), pricePerLiter:nums[2]?parseFloat(nums[2]):null });
}

/**
 * Открывает модальное окно для добавления/редактирования заправки.
 * @param {object|null} record - существующая запись (для редактирования)
 */
function openFuelModal(record=null) {
    const isEdit = !!(record && record.rowIndex);
    let defaultDate = record?.date ? isoToDDMMYYYY(record.date) : isoToDDMMYYYY(new Date().toISOString().split('T')[0]);
    const modal = createModal(isEdit?'✏️ Редактировать заправку':'⛽ Добавить заправку', `
        <form id="fuel-form">
            ${isEdit?`<input type="hidden" name="rowIndex" value="${record.rowIndex}">`:''}
            <label>Дата (ДД-ММ-ГГГГ)</label><input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="applyDateMaskDDMMYYYY(event)" value="${defaultDate}">
            <label>Пробег</label><input type="number" name="mileage" value="${record?.mileage || settings.currentMileage}" required>
            <label>Литры</label><input type="number" name="liters" step="0.01" value="${record?.liters || ''}" required>
            <label>Цена/л</label><input type="number" name="pricePerLiter" step="0.01" value="${record?.pricePerLiter || ''}">
            <label>Полный бак? <input type="checkbox" name="fullTank" value="true" ${record?.fullTank?'checked':''}></label>
            <label>Тип топлива</label>
            <select name="fuelType">
                <option value="Бензин" ${record?.fuelType==='Бензин'?'selected':''}>Бензин</option>
                <option value="Дизель" ${record?.fuelType==='Дизель'?'selected':''}>Дизель</option>
                <option value="Газ (ГБО)" ${record?.fuelType==='Газ (ГБО)'?'selected':''}>Газ (ГБО)</option>
                <option value="Электричество" ${record?.fuelType==='Электричество'?'selected':''}>Электричество</option>
            </select>
            <label>Примечание</label><input type="text" name="notes" value="${record?.notes || ''}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#fuel-form');
    form.onsubmit = (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(form)); modal.remove();
        const rowData = [ddmmYYYYtoISO(d.date), d.mileage, d.liters, d.pricePerLiter, d.fullTank||'', d.fuelType, d.notes||''];
        (isEdit ? writeSheet(`FuelLog!A${d.rowIndex}:G${d.rowIndex}`, [rowData]) : appendSheet('FuelLog!A:G', [rowData])).then(()=>loadSheet()).catch(e=>console.warn(e));
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

/**
 * Открывает модальное окно для смены резины (новый комплект или сезонная замена).
 * @param {object|null} record - запись шин для редактирования
 */
function openTireModal(record=null) {
    const isEdit = !!record;
    const defaultDate = record ? isoToDDMMYYYY(record.date) : isoToDDMMYYYY(new Date().toISOString().split('T')[0]);
    const typeValue = record?.type || 'Лето';
    const isNewSet = record ? (record.mileage===0 && record.purchaseCost) : false;
    const modal = createModal(isEdit?'✏️ Редактировать запись шин':'🛞 Сменить резину', `
        <form id="tire-form">
            ${isEdit?`<input type="hidden" name="rowIndex" value="${record.rowIndex}">`:''}
            <label>Дата (ДД-ММ-ГГГГ)</label><input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="applyDateMaskDDMMYYYY(event)" value="${defaultDate}">
            <label>Тип</label><select name="type"><option value="Лето" ${typeValue==='Лето'?'selected':''}>Лето</option><option value="Зима" ${typeValue==='Зима'?'selected':''}>Зима</option></select>
            <label><input type="checkbox" name="isNewSet" id="isNewSetCheckbox" ${isNewSet?'checked':''}> Новый комплект</label>
            <div id="newSetFields" style="display:${isNewSet?'block':'none'};"><label>Название модели</label><input type="text" name="model" value="${record?.model||''}"><label>Размерность</label><input type="text" name="size" value="${record?.size||''}"><label>Стоимость покупки (₽)</label><input type="number" name="purchaseCost" step="0.01" value="${record?.purchaseCost||''}"></div>
            <div id="mountFields" style="display:${isNewSet?'none':'block'};"><label>Текущий пробег (км)</label><input type="number" name="currentMileage" value="${isNewSet?0:settings.currentMileage}" required><label>Стоимость шиномонтажа (₽)</label><input type="number" name="mountCost" step="0.01" value="${record?.mountCost||''}"><label><input type="checkbox" name="isDIY" value="true" ${record?.isDIY?'checked':''}> Сделал сам</label></div>
            <label>Износ / Остаток шипов (${typeValue==='Зима'?'%':'мм'})</label><input type="number" name="wear" step="0.1" value="${record?.wear||''}">
            <label>Примечание</label><input type="text" name="notes" value="${record?.notes||''}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    modal.querySelector('#isNewSetCheckbox').addEventListener('change', e => {
        modal.querySelector('#newSetFields').style.display = e.target.checked ? 'block' : 'none';
        modal.querySelector('#mountFields').style.display = e.target.checked ? 'none' : 'block';
    });
    const form = modal.querySelector('#tire-form');
    form.onsubmit = (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(form)); modal.remove();
        const isNew = d.isNewSet === 'on';
        let setMileage = isNew ? 0 : (parseFloat(d.currentMileage)||settings.currentMileage);
        if (!isNew) { const last = tireLog.find(r=>r.type===d.type); setMileage = (last?.mileage||0) + (setMileage - (last?.baseMileage||0)); }
        const rowData = [ddmmYYYYtoISO(d.date), d.type, setMileage, d.model||'', d.size||'', d.wear||'', d.notes||'', isNew?(d.purchaseCost||''):'', isNew?'':(d.mountCost||''), d.isDIY==='true'];
        (isEdit ? writeSheet(`Tires!A${d.rowIndex}:J${d.rowIndex}`, [rowData]) : appendSheet('Tires!A:J', [rowData])).then(()=>{
            loadSheet();
            if (!isNew && (d.mountCost || d.isDIY)) { const tireOp = operations.find(o=>o.name==='Шиномонтаж'); if(tireOp) addServiceRecord(tireOp.id, ddmmYYYYtoISO(d.date), settings.currentMileage, settings.currentMotohours, 0, d.isDIY==='true'?0:(d.mountCost||0), d.isDIY==='true', `Смена резины: ${d.type} ${d.model||''}`, ''); }
        }).catch(e=>console.warn(e));
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

// ==================== 15-А. СТАТИСТИКА И ФИЛЬТРЫ ====================
/** Возвращает начальную дату для выбранного периода (неделя, месяц, квартал, полгода, год) */
function getStartDateForPeriod(period) {
    const now = new Date();
    switch (period) {
        case 'week': return new Date(now.setDate(now.getDate()-7));
        case 'month': return new Date(now.setMonth(now.getMonth()-1));
        case 'quarter': return new Date(now.setMonth(now.getMonth()-3));
        case '6months': return new Date(now.setMonth(now.getMonth()-6));
        case 'year': return new Date(now.setFullYear(now.getFullYear()-1));
        default: return null;
    }
}

/** Фильтрует массив записей по дате (поле dateField) за указанный период */
function filterByPeriod(records, period, dateField='date') {
    if (period === 'all') return records;
    const start = getStartDateForPeriod(period); if (!start) return records;
    return records.filter(r => { const d = r[dateField] ? new Date(r[dateField]) : null; return d && d >= start; });
}

/**
 * Рассчитывает ключевые показатели за выбранный период:
 * - затраты на ТО и топливо
 * - стоимость 1 км
 * - средний расход топлива
 * - средний пробег и моточасы в день
 */
function calculateStatistics(period='all') {
    const fServ = filterByPeriod(serviceRecords, period);
    const fFuel = filterByPeriod(fuelLog, period);
    const fMile = filterByPeriod(mileageHistory, period);
    const totalMaint = fServ.reduce((s,r)=>s+(+r.parts_cost||0)+(+r.work_cost||0),0);
    const totalFuel = fFuel.reduce((s,f)=>s+((+f.liters||0)*(+f.pricePerLiter||0)),0);
    let periodMileage=0, periodDays=1, periodMotohours=0;
    if (fMile.length>=2) {
        const first=fMile[0], last=fMile[fMile.length-1]; periodMileage=last.mileage-first.mileage;
        periodDays=Math.ceil((new Date(last.date)-new Date(first.date))/86400000)||1;
        periodMotohours=(last.motohours||0)-(first.motohours||0);
    } else if (fMile.length===1) {
        const r=fMile[0]; periodMileage=settings.currentMileage-(baseMileage||r.mileage);
        periodDays=ownershipDays||1; periodMotohours=settings.currentMotohours-(baseMotohours||r.motohours);
    } else { periodMileage=settings.currentMileage-(baseMileage||0); periodDays=ownershipDays||1; periodMotohours=settings.currentMotohours-(baseMotohours||0); }
    const totalCost = totalMaint+totalFuel, costPerKm = periodMileage>0 ? totalCost/periodMileage : 0;
    const totalLiters = fFuel.reduce((s,f)=>s+(+f.liters||0),0), avgCons = periodMileage>0 ? (totalLiters/periodMileage)*100 : 0;
    let avgMileageDay=0, avgMotoDay=0;
    if (fMile.length>=2) { const first=fMile[0], last=fMile[fMile.length-1]; const days=Math.ceil((new Date(last.date)-new Date(first.date))/86400000)||1; avgMileageDay=(last.mileage-first.mileage)/days; avgMotoDay=((last.motohours||0)-(first.motohours||0))/days; }
    else { avgMileageDay=periodMileage/periodDays; avgMotoDay=periodMotohours/periodDays; }
    return { totalMaintenanceCost:Number(totalMaint), totalFuelCost:Number(totalFuel), costPerKm:Number(costPerKm), avgFuelConsumption:Number(avgCons), avgMileagePerDay:Number(avgMileageDay), avgMotohoursPerDay:Number(avgMotoDay) };
}

// ==================== 16. СТАТИСТИКА (ОТРИСОВКА) ====================
/** Обновляет виджет статистики (карточки и график масла) */
function renderStats() {
    const periodSelect = document.getElementById('stats-period-select'), period = periodSelect ? periodSelect.value : 'all';
    const stats = calculateStatistics(period);
    if (stats) {
        if (totalMaintenanceCostEl) totalMaintenanceCostEl.textContent = (stats.totalMaintenanceCost??0).toFixed(0);
        if (totalFuelCostEl) totalFuelCostEl.textContent = (stats.totalFuelCost??0).toFixed(0);
        if (costPerKmEl) costPerKmEl.textContent = (stats.costPerKm??0).toFixed(2);
        if (avgFuelConsumptionEl) avgFuelConsumptionEl.textContent = (stats.avgFuelConsumption??0).toFixed(1);
        if (avgMileagePerDayEl) avgMileagePerDayEl.textContent = (stats.avgMileagePerDay??0).toFixed(1);
        if (avgMotohoursPerDayEl) avgMotohoursPerDayEl.textContent = (stats.avgMotohoursPerDay??0).toFixed(2);
        updateOwnershipDisplay();
    }
    // График масла
    const oilOp = operations.find(op => op.name.includes('Масло') && op.category.includes('ДВС'));
    if (oilOp) {
        const plan = calculatePlan(oilOp);
        const canvas = oilChart;
        if (canvas && typeof Chart !== 'undefined') {
            try {
                const ctx = canvas.getContext('2d');
                const current = settings.currentMileage;
                const last = oilOp.lastMileage || 0;
                const next = plan.planMileage;
                const percent = Math.min(100, Math.max(0, Math.round((current - last) / (next - last) * 100)));
                const existingChart = Chart.getChart(canvas);
                if (existingChart) existingChart.destroy();
                new Chart(ctx, {
                    type: 'doughnut',
                    data: { labels: ['Пройдено', 'Осталось'], datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#2ecc71', '#e0e0e0'] }] },
                    options: { cutout: '70%', plugins: { legend: { display: false } } }
                });
            } catch(e) { console.warn('Ошибка графика масла:', e); }
        }
    }
}

/** Преобразует число (Excel-дату) в строку ГГГГ-ММ-ДД */
function excelDateToISO(serial) { if (!serial || typeof serial!=='number') return ''; const d = new Date((serial-25569)*86400000); return d.toISOString().split('T')[0]; }

// ==================== 17. ИСТОРИЯ ====================
/** Загружает историю выполненных ТО из листа "История" и отрисовывает таблицу */
async function loadHistory() {
    if (!spreadsheetId) return;
    try {
        const raw = await readSheet('История!A2:J'); const validRows=[], hData=[];
        raw.forEach((r,i)=>{ if(r.some(c=>c!==''&&c!=null)){ hData.push(r); validRows.push(i+2); } });
        serviceRecords = hData.map(r=>({ operation_id:r[0], date:typeof r[1]==='number'?excelDateToISO(r[1]):r[1], mileage:r[2], motohours:r[3], parts_cost:r[4], work_cost:r[5], is_diy:r[6], notes:r[7], photo_url:r[8], timestamp:r[9] }));
        const tbody = historyBody; if (!tbody) return;
        tbody.innerHTML = '';
        hData.sort((a,b)=>(a[1]||'').localeCompare(b[1]||'')).reverse().forEach((row,di) => {
            const physicalRow = validRows[hData.length-1-di], tr = document.createElement('tr');
            const op = operations.find(o=>o.id==row[0])||{name:'Неизвестно'}, date = typeof row[1]==='number'?excelDateToISO(row[1]):row[1]||'';
            const diy = row[6]==='TRUE'||row[6]===true;
            tr.innerHTML = `<td>${date}</td><td>${op.name}</td><td>${row[2]||''}</td><td>${row[3]||''}</td><td>${row[4]||''}</td><td>${row[5]||''}</td><td>${row[7]||''}</td><td style="text-align:center;">${diy?'✅':'—'}</td><td><button class="icon-btn edit-history-btn" data-row="${physicalRow}" data-opid="${row[0]}" data-date="${date}" data-mileage="${row[2]}" data-motohours="${row[3]}" data-parts="${row[4]}" data-work="${row[5]}" data-diy="${row[6]}" data-notes="${row[7]}" data-photo="${row[8]}">✏️</button> <button class="icon-btn delete-history-btn" data-row="${physicalRow}">🗑️</button></td>`;
            tbody.appendChild(tr);
        });
        document.querySelectorAll('.edit-history-btn').forEach(b=>b.addEventListener('click', openHistoryEdit));
        document.querySelectorAll('.delete-history-btn').forEach(b=>b.addEventListener('click', deleteHistoryEntry));
    } catch(e) { console.warn(e); }
}

/** Открывает форму редактирования записи истории */
function openHistoryEdit(e) {
    const btn = e.currentTarget;
    const rowIndex = btn.dataset.row;
    const opId = btn.dataset.opid;
    const date = btn.dataset.date;
    const mileage = btn.dataset.mileage;
    const motohours = btn.dataset.motohours;
    const partsCost = btn.dataset.parts;
    const workCost = btn.dataset.work;
    const isDIY = btn.dataset.diy === 'true';
    const notes = btn.dataset.notes;
    const photoUrl = btn.dataset.photo;
    const modal = createModal('✏️ Редактировать запись истории', `
        <form id="history-edit-form">
            <input type="hidden" name="rowIndex" value="${rowIndex}">
            <label>Дата (ГГГГ-ММ-ДД)</label>
            <input type="text" name="date" value="${date}" placeholder="ГГГГ-ММ-ДД" pattern="\\d{4}-\\d{2}-\\d{2}" required oninput="applyDateMaskISO(event)">
            <label>Пробег, км</label><input type="number" name="mileage" value="${mileage}">
            <label>Моточасы</label><input type="text" name="motohours" value="${motohours}">
            <label>Запчасти, ₽</label><input type="number" name="partsCost" value="${partsCost}" step="0.01">
            <label>Работа, ₽</label><input type="number" name="workCost" value="${workCost}" step="0.01">
            <label><input type="checkbox" name="isDIY" value="true" ${isDIY ? 'checked' : ''}> Сделал сам</label>
            <label>Примечание</label><input type="text" name="notes" value="${notes}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#history-edit-form');
    form.onsubmit = (ev) => {
        ev.preventDefault();
        const data = new FormData(form);
        const row = data.get('rowIndex');
        let newDate = data.get('date');
        const newValues = [opId, newDate, data.get('mileage'), data.get('motohours'), data.get('partsCost'), data.get('workCost'), data.get('isDIY') === 'true', data.get('notes'), photoUrl];
        modal.remove();
        writeSheet(`История!A${row}:J${row}`, [newValues.concat(new Date().toISOString())])
            .then(() => { loadHistory(); loadSheet(); })
            .catch(e => { console.error('Ошибка сохранения:', e); alert('Не удалось сохранить'); });
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

/** Удаляет запись из истории (затирает строку) */
async function deleteHistoryEntry(e) {
    const btn = e.currentTarget;
    const rowIndex = btn.dataset.row;
    if (!confirm('Удалить запись из истории? Это действие нельзя отменить.')) return;
    await writeSheet(`История!A${rowIndex}:J${rowIndex}`, [['','','','','','','','','','']]);
    loadHistory();
}

// ==================== 19. ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ====================
/** Назначает все глобальные обработчики событий (кнопки, табы, онлайн/офлайн и т.д.) */
function initEventListeners() {
    authBtn.addEventListener('click', e=>{ e.preventDefault(); startAuth(); });
    recalculateBtn.onclick = ()=>{ renderTOTable(); renderTop5Widget(); };
    exportBtn.onclick = exportData;
    importBtn.onclick = ()=>importFile.click();
    importFile.onchange = importData;
    addOperationBtn.onclick = ()=>openOperationForm();
    addPartBtn.onclick = ()=>openPartForm();
    addFuelBtn.onclick = ()=>openFuelModal({});
    voiceFuelBtn.onclick = startVoiceInput;
    saveSettingsBtn.onclick = saveSettings;
    subscribePushBtn.onclick = subscribeToPush;
    openPhotoFolderBtn.onclick = async ()=>{ if(!driveFolderId) driveFolderId=await getOrCreatePhotoFolder(); if(driveFolderId) window.open(`https://drive.google.com/drive/folders/${driveFolderId}`,'_blank'); else alert('Папка не создана'); };
    shareTableBtn.onclick = ()=>window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,'_blank');
    themeToggle.onclick = ()=>{ document.body.classList.toggle('dark'); themeToggle.textContent = document.body.classList.contains('dark')?'☀️':'🌙'; };
    const selectCarBtn = document.getElementById('select-car-btn'); if(selectCarBtn) selectCarBtn.addEventListener('click', openCarSelectModal);
    document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        btn.classList.add('active'); document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        if(btn.dataset.tab==='history') loadHistory();
        if(btn.dataset.tab==='stats') renderStats();
        if(btn.dataset.tab==='to') renderTop5Widget();
        if(btn.dataset.tab==='fuel') renderFuelTable();
        if(btn.dataset.tab==='tires') renderTiresTable();
        if(btn.dataset.tab==='parts') renderPartsTable();
    }));
    window.addEventListener('online', ()=>{ isOnline=true; syncPendingActions(); setSyncStatus('synced'); });
    window.addEventListener('offline', ()=>{ isOnline=false; setSyncStatus('error'); });
    addTireBtn.onclick = ()=>openTireModal();
    const updateBtn = document.getElementById('update-mileage-btn'); if(updateBtn) updateBtn.addEventListener('click', updateMileageAndAverages);
    const periodSelect = document.getElementById('stats-period-select');
    if(periodSelect) { periodSelect.value = localStorage.getItem('stats_period')||'all'; periodSelect.addEventListener('change', ()=>{ localStorage.setItem('stats_period', periodSelect.value); if(document.getElementById('tab-stats').classList.contains('active')) renderStats(); }); }
    if(toggleOwnershipUnitBtn) toggleOwnershipUnitBtn.addEventListener('click', ()=>{ ownershipDisplayMode = ownershipDisplayMode==='days'?'years':'days'; updateOwnershipDisplay(); });
}

// ==================== 20. ОБНОВЛЕНИЕ ПРОБЕГА И ВЛАДЕНИЕ ====================
/** Обновляет текущий пробег и моточасы, пересчитывает средние показатели */
async function updateMileageAndAverages() {
    const m = document.getElementById('new-mileage'), h = document.getElementById('new-motohours'); if(!m||!h){ alert('Поля не найдены'); return; }
    const newM = parseFloat(m.value), newH = parseFloat(h.value); if(isNaN(newM)||isNaN(newH)){ alert('Введите числа'); return; }
    const today = new Date().toISOString().split('T')[0];
    await appendSheet('MileageLog!A:C', [[today, newM, newH]]);
    mileageHistory.push({ date:today, mileage:newM, motohours:newH }); mileageHistory.sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(mileageHistory.length>=2){ const l=mileageHistory.at(-1), p=mileageHistory.at(-2); const days=(new Date(l.date)-new Date(p.date))/86400000; if(days>0){ settings.avgDailyMileage=(l.mileage-p.mileage)/days; settings.avgDailyMotohours=(l.motohours-p.motohours)/days; } }
    else { settings.avgDailyMileage=baseMileage>0?(newM-baseMileage)/30:20; settings.avgDailyMotohours=baseMotohours>0?(newH-baseMotohours)/30:1.65; }
    settings.currentMileage=newM; settings.currentMotohours=newH;
    await writeSheet('Журнал ТО!Q1:Q4', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours]]);
    renderAll(); renderTop5Widget(); alert('Обновлено');
}

/** Обновляет отображение количества дней/лет владения */
function updateOwnershipDisplay() { if(!ownershipDisplay||!ownershipUnit) return; ownershipDisplay.textContent = ownershipDisplayMode==='days' ? ownershipDays : (ownershipDays/365.25).toFixed(1); ownershipUnit.textContent = ownershipDisplayMode==='days' ? 'дней' : 'лет'; }

/** Рассчитывает количество дней с даты покупки */
function calculateOwnershipDays() { const inp = document.getElementById('ownership-days'); if(!purchaseDate){ ownershipDays=0; if(inp) inp.value=''; updateOwnershipDisplay(); return; } const d=new Date(), p=new Date(purchaseDate); ownershipDays=Math.floor(Math.abs(d-p)/86400000); if(inp) inp.value=ownershipDays; updateOwnershipDisplay(); }

// ==================== 20-А. ВИДЖЕТ ТОП-5 ====================
const LINKED_PAIRS = [
    { main: 'Масло', linked: 'Масляный фильтр', combinedName: 'Масло + фильтр' },
    { main: 'Масло CVT (частичная)', linked: 'Фильтр вариатора', combinedName: 'Масло CVT + фильтр' }
];

/** Отрисовывает виджет пяти ближайших ТО (с учётом связанных пар) */
function renderTop5Widget() {
    const container = document.getElementById('top5-container');
    if (!container) return;
    let candidates = operations.filter(op => {
        if (!op.intervalKm && !op.intervalMonths && !op.intervalMotohours) return false;
        const plan = calculatePlan(op);
        return plan.daysLeft !== null && isFinite(plan.daysLeft) && plan.planDate;
    });
    if (candidates.length === 0) {
        container.innerHTML = '<p class="hint">Нет данных для отображения</p>';
        return;
    }
    const groupedOps = [];
    const usedIds = new Set();
    for (const op of candidates) {
        if (usedIds.has(op.id)) continue;
        let isMainOfPair = false;
        let pair = null;
        for (const p of LINKED_PAIRS) {
            if (op.name === p.main) {
                isMainOfPair = true;
                pair = p;
                break;
            }
        }
        if (isMainOfPair) {
            const linkedOp = candidates.find(o => o.name === pair.linked && !usedIds.has(o.id));
            if (linkedOp) {
                const mainPlan = calculatePlan(op);
                const linkedPlan = calculatePlan(linkedOp);
                const primaryPlan = mainPlan.daysLeft <= linkedPlan.daysLeft ? mainPlan : linkedPlan;
                const primaryOp = mainPlan.daysLeft <= linkedPlan.daysLeft ? op : linkedOp;
                groupedOps.push({ name: pair.combinedName, op: primaryOp, plan: primaryPlan, isGroup: true });
                usedIds.add(op.id);
                usedIds.add(linkedOp.id);
                continue;
            }
        }
        let isLinkedInPair = false;
        for (const p of LINKED_PAIRS) {
            if (op.name === p.linked) { isLinkedInPair = true; break; }
        }
        if (isLinkedInPair) {
            const mainOp = candidates.find(o => o.name === LINKED_PAIRS.find(p => p.linked === op.name)?.main);
            if (mainOp && !usedIds.has(mainOp.id)) continue;
        }
        if (!usedIds.has(op.id)) {
            groupedOps.push({ name: op.name, op: op, plan: calculatePlan(op), isGroup: false });
            usedIds.add(op.id);
        }
    }
    const sorted = groupedOps.sort((a, b) => a.plan.daysLeft - b.plan.daysLeft);
    const top5 = sorted.slice(0, 5);
    let html = '';
    top5.forEach(item => {
        const op = item.op;
        const plan = item.plan;
        let motoFresh = true;
        if (op.name.includes('Масло') && op.category.includes('ДВС')) {
            if (mileageHistory.length >= 1) {
                const lastEntry = mileageHistory[mileageHistory.length - 1];
                const motoDiff = settings.currentMotohours - lastEntry.motohours;
                const mileageDiff = settings.currentMileage - lastEntry.mileage;
                if (motoDiff > 20 || mileageDiff > 500) motoFresh = false;
            }
        }
        let percent = 0;
        if (op.intervalKm && plan.planMileage > (op.lastMileage || 0)) {
            percent = Math.min(100, Math.round((settings.currentMileage - (op.lastMileage || 0)) / (plan.planMileage - (op.lastMileage || 0)) * 100));
        } else if (op.intervalMotohours && motoFresh && plan.recMotohours > (op.lastMotohours || 0)) {
            percent = Math.min(100, Math.round((settings.currentMotohours - (op.lastMotohours || 0)) / (plan.recMotohours - (op.lastMotohours || 0)) * 100));
        } else if (op.intervalMonths) {
            const lastDate = op.lastDate ? new Date(op.lastDate) : new Date();
            const totalDays = op.intervalMonths * 30;
            const elapsed = Math.floor((new Date() - lastDate) / 86400000);
            percent = Math.min(100, Math.round((elapsed / totalDays) * 100));
        }
        if (percent < 0) percent = 0;
        const daysLeft = plan.daysLeft;
        const mileageLeft = plan.planMileage - settings.currentMileage;
        const motoLeft = plan.recMotohours ? (plan.recMotohours - settings.currentMotohours) : null;
        let statusText = '';
        if (daysLeft < 0) statusText = `⚠️ просрочено на ${Math.abs(daysLeft)} дн.`;
        else statusText = `осталось ${daysLeft} дн.`;
        if (mileageLeft > 0 && op.intervalKm) statusText += ` / ${mileageLeft} км`;
        else if (motoLeft > 0 && op.intervalMotohours && motoFresh) statusText += ` / ${motoLeft.toFixed(0)} м/ч`;
        html += `
            <div class="top5-item">
                <div class="top5-header">
                    <span class="top5-name">${item.name}</span>
                    <span class="top5-stats">${statusText}</span>
                </div>
                <div class="top5-progress-container">
                    <div class="top5-progress-bar" style="width: ${percent}%;"></div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// ==================== 21. ЗАПУСК ====================
pendingActions = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
settings.notificationMethod = localStorage.getItem('notificationMethod') || 'telegram';
initGoogleApi();
initEventListeners();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');










