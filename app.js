// ==================== 1. КОНФИГУРАЦИЯ ====================
const CLIENT_ID = '593689755085-9llh88kf9pvedbcpfumifq4gkj0kh248.apps.googleusercontent.com'; // ЗАМЕНИТЕ НА СВОЙ
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file';
const CACHE_KEY = 'vesta_to_cache';
const PENDING_KEY = 'vesta_pending_actions';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ==================== 2. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let accessToken = null;
let spreadsheetId = '';
let driveFolderId = null;

let operations = [];
let parts = [];
let fuelLog = [];
let tireLog = [];
let workCosts = [];
let serviceRecords = [];

let settings = {
    currentMileage: 0,
    currentMotohours: 0,
    avgDailyMileage: 45,
    avgDailyMotohours: 1.8,
    telegramToken: '',
    telegramChatId: '',
    notificationMethod: 'telegram'
};

let isOnline = navigator.onLine;
let pendingActions = [];

// ==================== 2-А. НОВЫЕ ПЕРЕМЕННЫЕ (v2.1) ====================
let mileageHistory = [];
let baseMileage = 0;
let baseMotohours = 0;
let purchaseDate = '';
let ownershipDays = 0;

// ==================== 2-Б. ПРОФИЛИ АВТОМОБИЛЕЙ ====================
let carProfiles = [];                // [{ id, name, lastUsed }]
let currentProfileId = '';
const PROFILES_KEY = 'vesta_car_profiles';

// ==================== 3. DOM ЭЛЕМЕНТЫ ====================
const authPanel = document.getElementById('auth-panel');
const authBtn = document.getElementById('authorize-btn');
const authStatus = document.getElementById('auth-status');
const spreadsheetPanel = document.getElementById('spreadsheet-panel');
const dataPanel = document.getElementById('data-panel');
const sheetIdInput = document.getElementById('spreadsheet-id');
const loadSheetBtn = document.getElementById('load-sheet-btn');
const sheetStatus = document.getElementById('sheet-status');
const syncIndicator = document.getElementById('sync-indicator');
const themeToggle = document.getElementById('theme-toggle');

const displayMileage = document.getElementById('display-mileage');
const displayMotohours = document.getElementById('display-motohours');
const displayAvgMileage = document.getElementById('display-avg-mileage');
const displayAvgMotohours = document.getElementById('display-avg-motohours');
const addOperationBtn = document.getElementById('add-operation-btn');
const recalculateBtn = document.getElementById('recalculate-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
const tableBody = document.getElementById('table-body');
const partsBody = document.getElementById('parts-body');
const fuelBody = document.getElementById('fuel-body');
const tiresBody = document.getElementById('tires-body');
const historyBody = document.getElementById('history-body');
const addFuelBtn = document.getElementById('add-fuel-btn');
const voiceFuelBtn = document.getElementById('voice-fuel-btn');
const addTireBtn = document.getElementById('add-tire-btn');
const addPartBtn = document.getElementById('add-part-btn');
const setMileage = document.getElementById('set-mileage');
const setMotohours = document.getElementById('set-motohours');
const setAvgMileage = document.getElementById('set-avg-mileage');
const setAvgMotohours = document.getElementById('set-avg-motohours');
const telegramTokenInput = document.getElementById('telegram-token');
const telegramChatIdInput = document.getElementById('telegram-chatid');
const notificationMethodSelect = document.getElementById('notification-method');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsResult = document.getElementById('settings-result');
const subscribePushBtn = document.getElementById('subscribe-push-btn');
const pushStatus = document.getElementById('push-status');
const openPhotoFolderBtn = document.getElementById('open-photo-folder-btn');
const shareTableBtn = document.getElementById('share-table-btn');
const oilChart = document.getElementById('oilChart');
const costsChart = document.getElementById('costsChart');
const fuelChart = document.getElementById('fuelChart');

// ==================== 4. АВТОРИЗАЦИЯ ====================
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
        spreadsheetPanel.style.display = 'block';
        const savedId = localStorage.getItem('vesta_spreadsheet_id');
        if (savedId) {
        sheetIdInput.value = savedId;
         loadSheet();
         addOrUpdateProfile(savedId);
        }
        
        return true;
    }
    return false;
}

function initGoogleApi() {
    if (checkTokenInUrl()) return;
    const savedToken = sessionStorage.getItem('vesta_token');
    if (savedToken) {
        accessToken = savedToken;
        authStatus.textContent = '✅ Авторизован';
        authPanel.style.display = 'none';
        spreadsheetPanel.style.display = 'block';
        setSyncStatus('synced');
        return;
    }
    authPanel.style.display = 'block';
}

// ==================== 4-А. РАБОТА С ПРОФИЛЯМИ ====================
function loadProfiles() {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
        try {
            carProfiles = JSON.parse(stored);
        } catch (e) {
            carProfiles = [];
        }
    }
    // Сортируем по дате последнего использования (сначала свежие)
    carProfiles.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

function saveProfiles() {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(carProfiles));
}

function addOrUpdateProfile(id, name = null) {
    const existing = carProfiles.find(p => p.id === id);
    const now = Date.now();
    if (existing) {
        existing.lastUsed = now;
        if (name) existing.name = name;
    } else {
        carProfiles.push({
            id: id,
            name: name || 'Мой автомобиль',
            lastUsed: now
        });
    }
    carProfiles.sort((a, b) => b.lastUsed - a.lastUsed);
    saveProfiles();
    currentProfileId = id;
}

function getLastUsedProfileId() {
    loadProfiles();
    return carProfiles.length > 0 ? carProfiles[0].id : null;
}

// Загрузить таблицу по ID профиля
async function loadProfileById(id) {
    if (!id) return;
    sheetIdInput.value = id;
    spreadsheetId = id;
    currentProfileId = id;
    await loadSheet();
    addOrUpdateProfile(id); // обновляем lastUsed
}

// ==================== 5. УТИЛИТЫ API ====================
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
            spreadsheetPanel.style.display = 'none';
            throw new Error('Требуется повторная авторизация');
        }
        throw new Error(`API error: ${res.status}`);
    }
    return res.json();
}

async function readSheet(range) {
    const data = await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`);
    return data.values || [];
}

async function writeSheet(range, values) {
    await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values }),
    });
}

async function appendSheet(range, values) {
    await apiCall(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values }),
    });
}

// ==================== 6. ИНДИКАТОР СИНХРОНИЗАЦИИ ====================
function setSyncStatus(status) {
    syncIndicator.className = status;
    syncIndicator.title = status === 'synced' ? 'Синхронизировано' : status === 'syncing' ? 'Синхронизация...' : 'Ошибка соединения';
}

// ==================== 7. ЗАГРУЗКА ДАННЫХ ====================
async function loadSheet() {
    spreadsheetId = sheetIdInput.value.trim();
    if (!spreadsheetId) return;
    localStorage.setItem('vesta_spreadsheet_id', spreadsheetId);
    setSyncStatus('syncing');
    try {
    const [opsData, settingsData, partsData, tiresData, workCostsData] = await Promise.all([
     readSheet('Журнал ТО!A2:H'),
     readSheet('Журнал ТО!Q1:Q8'),
     readSheet('PartsCatalog!A2:G').catch(() => []),
     readSheet('Tires!A2:D').catch(() => []),
     readSheet('WorkCosts!A2:D').catch(() => [])
]);

        operations = opsData.filter(r => r[1]).map((r, i) => {
            let lastDate = null;
            if (r[2]) {
                const parsed = new Date(r[2]);
                lastDate = isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
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
            settings.currentMileage = +settingsData[0][0] || 0;
            settings.currentMotohours = +settingsData[1][0] || 0;
            settings.avgDailyMileage = +settingsData[2][0] || 45;
            settings.avgDailyMotohours = +settingsData[3][0] || 1.8;
            settings.telegramToken = settingsData[6]?.[0] || '';
            settings.telegramChatId = settingsData[7]?.[0] || '';
        }

        parts = partsData.map((r, i) => ({
            id: i + 2, operation: r[0] || '', oem: r[1] || '', analog: r[2] || '',
            price: r[3] || '', supplier: r[4] || '', link: r[5] || '', comment: r[6] || ''
        }));

        // Загрузка топлива (столбцы A–G)
const fuelData = await readSheet('FuelLog!A2:G').catch(() => []);
fuelLog = fuelData.map(r => ({
    date: typeof r[0] === 'number' ? excelDateToISO(r[0]) : r[0],
    mileage: +r[1],
    liters: +r[2],
    pricePerLiter: +r[3],
    fullTank: r[4],
    fuelType: r[5] || 'Бензин',
    notes: r[6]
}));
         
        tireLog = tiresData.map(r => ({ date: r[0], type: r[1], mileage: +r[2], notes: r[3] }));
        workCosts = workCostsData.map(r => ({ operationId: +r[0], cost: +r[1], isDIY: r[2] === 'TRUE', notes: r[3] }));

        // Загрузка истории пробега (v2.1)
        const mileageData = await readSheet('MileageLog!A2:C').catch(() => []);
        mileageHistory = mileageData.map(r => ({
            date: r[0],
            mileage: +r[1],
            motohours: +r[2]
        })).sort((a,b) => new Date(a.date) - new Date(b.date));

        // Загрузка дополнительных настроек (v2.1)
        const extraSettings = await readSheet('Журнал ТО!Q9:Q12').catch(() => []);
        if (extraSettings.length >= 4) {
            baseMileage = +extraSettings[0][0] || 0;
            baseMotohours = +extraSettings[1][0] || 0;
            purchaseDate = extraSettings[2]?.[0] || '';
        }
        calculateOwnershipDays();

        localStorage.setItem(CACHE_KEY, JSON.stringify({ operations, settings, parts, fuelLog, tireLog, workCosts }));
        renderAll();
        dataPanel.style.display = 'block';
        setSyncStatus('synced');
        sheetStatus.textContent = '✅ Данные загружены';
        syncPendingActions();
        driveFolderId = await getOrCreatePhotoFolder();
        loadHistory();
        addOrUpdateProfile(spreadsheetId);
    } catch (e) {
        setSyncStatus('error');
        sheetStatus.textContent = `❌ ${e.message}`;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const d = JSON.parse(cached);
            operations = d.operations; settings = d.settings; parts = d.parts || [];
            fuelLog = d.fuelLog || []; tireLog = d.tireLog || []; workCosts = d.workCosts || [];
            renderAll(); dataPanel.style.display = 'block';
        }
    }
}


// ==================== 8. РАСЧЁТ ПЛАНОВ ====================
function getOilMotohoursInterval(op, avgSpeed) {
    if (op.name.includes('Масло') && op.category.includes('ДВС')) {
        return avgSpeed < 20 ? 200 : 250;
    }
    return op.intervalMotohours;
}

function calculatePlan(op) {
    const today = new Date(); today.setHours(0,0,0,0);
    
    // Календарная дата
    let recDate = new Date(8640000000000000);
    if (op.intervalMonths) {
        recDate = op.lastDate ? new Date(op.lastDate) : new Date(today);
        recDate.setMonth(recDate.getMonth() + op.intervalMonths);
    }
    
    const recMileage = op.lastMileage ? op.lastMileage + op.intervalKm : op.intervalKm;
    const avgSpeed = settings.avgDailyMileage / settings.avgDailyMotohours;
    const motoInterval = getOilMotohoursInterval(op, avgSpeed);
    
    // Проверка актуальности моточасов для масла ДВС
    let isMotohoursFresh = true;
    if (op.name.includes('Масло') && op.category.includes('ДВС')) {
        if (mileageHistory.length >= 1) {
            const lastEntry = mileageHistory[mileageHistory.length - 1];
            const motoDiff = settings.currentMotohours - lastEntry.motohours;
            const mileageDiff = settings.currentMileage - lastEntry.mileage;
            if (motoDiff > 20 || mileageDiff > 500) {
                isMotohoursFresh = false;
            }
        }
    }
    
    let recMotohours = null;
    if (motoInterval && isMotohoursFresh) {
        recMotohours = op.lastMotohours ? op.lastMotohours + motoInterval : settings.currentMotohours + motoInterval;
    }
    
    // Даты по пробегу и моточасам
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
    
    // Если дата ушла в бесконечность (нет интервалов), сбрасываем daysLeft
    if (planDate.getFullYear() > 275000) {
        daysLeft = 0;
    }
    
    let planDateStr = '';
    if (planDate.getFullYear() < 275000) {
        planDateStr = planDate.toISOString().split('T')[0];
    }
    
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
function renderAll() {
    // Виджеты показателей (с проверками)
    if (displayMileage) displayMileage.textContent = settings.currentMileage;
    if (displayMotohours) displayMotohours.textContent = settings.currentMotohours;
    if (displayAvgMileage) displayAvgMileage.textContent = settings.avgDailyMileage;
    if (displayAvgMotohours) displayAvgMotohours.textContent = settings.avgDailyMotohours;

    renderTOTable(); renderPartsTable(); renderFuelTable(); renderTiresTable(); renderStats();renderTop5Widget();

    // Поля настроек (с проверками)
    if (setMileage) setMileage.value = settings.currentMileage;
    if (setMotohours) setMotohours.value = settings.currentMotohours;
    if (setAvgMileage) setAvgMileage.value = settings.avgDailyMileage;
    if (setAvgMotohours) setAvgMotohours.value = settings.avgDailyMotohours;
    if (telegramTokenInput) telegramTokenInput.value = settings.telegramToken || '';
    if (telegramChatIdInput) telegramChatIdInput.value = settings.telegramChatId || '';
    if (notificationMethodSelect) notificationMethodSelect.value = settings.notificationMethod || 'telegram';

    // Поля точки отсчёта и даты приобретения (v2.1)
    const baseMileageInput = document.getElementById('set-base-mileage');
    if (baseMileageInput) baseMileageInput.value = baseMileage;
    const baseMotohoursInput = document.getElementById('set-base-motohours');
    if (baseMotohoursInput) baseMotohoursInput.value = baseMotohours;
    const purchaseDateInput = document.getElementById('purchase-date');
    if (purchaseDateInput) purchaseDateInput.value = purchaseDate;
    calculateOwnershipDays();
}

function renderTOTable() {
    const tbody = tableBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    const grouped = {};
    operations.forEach(op => {
        if (!grouped[op.category]) grouped[op.category] = [];
        grouped[op.category].push(op);
    });
    const categories = Object.keys(grouped).sort((a,b) => {
        if (a === 'Прочее') return 1;
        if (b === 'Прочее') return -1;
        return a.localeCompare(b);
    });
    categories.forEach(cat => {
        const headerRow = document.createElement('tr');
        headerRow.style.background = '#34495e';
        headerRow.style.color = 'white';
        headerRow.innerHTML = `<td colspan="7" style="padding:8px; font-weight:bold;">${cat}</td>`;
        tbody.appendChild(headerRow);
        const opsInCat = grouped[cat].sort((a,b) => calculatePlan(a).daysLeft - calculatePlan(b).daysLeft);
        opsInCat.forEach(op => {
            const plan = calculatePlan(op);
            let cls = '';
            if (isFinite(plan.daysLeft)) {
                if (plan.daysLeft < 0) cls = 'overdue';
                else if (plan.daysLeft <= 10) cls = 'critical';
                else if (plan.daysLeft <= 20) cls = 'warning';
                else if (plan.daysLeft <= 30) cls = 'attention';
            }
            const tr = document.createElement('tr');
            tr.className = cls;
            tr.dataset.rowIndex = op.rowIndex;
            tr.dataset.operationId = op.id;
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
                    <button class="icon-btn calendar-btn" data-op-name="${op.name}" data-plan-date="${plan.planDate}" data-plan-mileage="${plan.planMileage}">📅</button>
                    <button class="icon-btn shopping-list-btn" data-op-id="${op.id}">🛒</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
    attachTOListeners();
}

function renderPartsTable() {
    const tbody = partsBody;
    tbody.innerHTML = '';
    parts.forEach(p => {
        const tr = document.createElement('tr'); tr.dataset.id = p.id;
        tr.innerHTML = `<td>${p.operation}</td><td>${p.oem}</td><td>${p.analog}</td><td>${p.price ? p.price+' ₽' : ''}</td><td>${p.supplier}</td><td>${p.link ? `<a href="${p.link}" target="_blank">🔗</a>` : ''}</td><td>${p.comment}</td>
            <td><button class="icon-btn edit-part-btn" data-id="${p.id}">✏️</button> <button class="icon-btn delete-part-btn" data-id="${p.id}">🗑️</button> <button class="icon-btn search-part-btn" data-oem="${p.oem}">🔍</button></td>`;
        tbody.appendChild(tr);
    });
    attachPartsListeners();
}

function renderFuelTable() {
    const tbody = fuelBody;
    tbody.innerHTML = '';
    fuelLog.forEach((f, i) => {
        const tr = document.createElement('tr');
        // Преобразуем дату из ГГГГ-ММ-ДД в ДД-ММ-ГГГГ
        let displayDate = f.date;
        if (f.date && f.date.includes('-')) {
            const parts = f.date.split('-');
            if (parts.length === 3) {
                displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        // Иконка для полного бака
        const fullTankIcon = f.fullTank === 'TRUE' || f.fullTank === true ? '✅' : '';
        tr.innerHTML = `
            <td>${displayDate}</td>
            <td>${f.mileage}</td>
            <td>${f.liters}</td>
            <td>${f.pricePerLiter}</td>
            <td style="text-align:center;">${fullTankIcon}</td>
            <td>${f.fuelType || ''}</td>
            <td>${f.notes || ''}</td>
            <td>
                <button class="icon-btn edit-fuel-btn" data-index="${i}">✏️</button>
                <button class="icon-btn delete-fuel-btn" data-index="${i}">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    attachFuelListeners();
} 

function renderTiresTable() {
    const tbody = tiresBody;
    tbody.innerHTML = '';
    tireLog.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.date}</td><td>${t.type}</td><td>${t.mileage}</td><td>${t.notes||''}</td>`;
        tbody.appendChild(tr);
    });
}

// ==================== 10. МОДАЛЬНЫЕ ОКНА ====================
function createModal(title, content) {
    const modal = document.createElement('div'); modal.className = 'modal'; modal.style.display = 'flex';
    modal.innerHTML = `<div class="modal-content"><span class="close">&times;</span><h3>${title}</h3>${content}</div>`;
    document.body.appendChild(modal);
    modal.querySelector('.close').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    return modal;
}

window.applyDateMaskISO = function(event) {
    let input = event.target;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    let formatted = '';
    if (value.length > 0) {
        formatted = value.substring(0, 4);
        if (value.length >= 5) formatted += '-' + value.substring(4, 6);
        if (value.length >= 7) formatted += '-' + value.substring(6, 8);
    }
    input.value = formatted;
};

// Маска ввода для ДД-ММ-ГГГГ
window.applyDateMaskDDMMYYYY = function(event) {
    let input = event.target;
    let value = input.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    let formatted = '';
    if (value.length > 0) {
        formatted = value.substring(0, 2);
        if (value.length >= 3) formatted += '-' + value.substring(2, 4);
        if (value.length >= 5) formatted += '-' + value.substring(4, 8);
    }
    input.value = formatted;
};

// Преобразование ДД-ММ-ГГГГ → ГГГГ-ММ-ДД
function ddmmYYYYtoISO(dateStr) {
    if (!dateStr || !/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// Преобразование ГГГГ-ММ-ДД → ДД-ММ-ГГГГ
function isoToDDMMYYYY(isoStr) {
    if (!isoStr || isoStr.length !== 10) return isoStr;
    const parts = isoStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function openServiceModal(opId, opName) {
    const op = operations.find(o => o.id == opId);
    const isOsago = (op && op.category === 'Документы' && op.name.includes('ОСАГО'));

    const modal = createModal('➕ Выполнить ТО', `
        <form id="service-form" enctype="multipart/form-data">
            <input type="hidden" name="opId" value="${opId}"><p><strong>${opName}</strong></p>
            <label>Дата (ГГГГ-ММ-ДД)</label>
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
        const data = new FormData(form);
        const photo = data.get('photo');
        const currentOpName = opName;
        const currentIsOsago = isOsago;
        
        // Мгновенно закрываем окно
        modal.remove();

        // Фоновое сохранение
        (async () => {
            try {
                let photoUrl = '';
                if (photo && photo.size > 0) photoUrl = await uploadPhoto(photo);
                const cost = data.get('cost') || '0';
                const workCost = data.get('workCost') || '0';
                const isDIY = data.get('isDIY') === 'true';
                const notes = data.get('notes') || '';
                const fileLink = data.get('fileLink') || '';
                const osagoMonths = data.get('osagoMonths') || '12';
                const motohours = parseFloat(data.get('motohours')) || 0;
                let formattedDate = ddmmYYYYtoISO(data.get('date'));

                let fullNotes = notes;
                if (currentIsOsago) {
                    fullNotes = `ОСАГО. Стоимость: ${cost} ₽. Срок: ${osagoMonths} мес. Ссылка: ${fileLink}. ` + notes;
                }

                await addServiceRecord(data.get('opId'), formattedDate, data.get('mileage'), motohours, cost, workCost, isDIY, fullNotes, photoUrl);

                // Автоматическая отметка масляного фильтра
                if (currentOpName === 'Масло') {
                    const filterOp = operations.find(o => o.name === 'Масляный фильтр' && o.category === 'ДВС');
                    if (filterOp) {
                        const today = formattedDate;
                        const alreadyDone = serviceRecords.some(rec => 
                            rec.operation_id === filterOp.id && rec.date === today
                        );
                        if (!alreadyDone) {
                            await addServiceRecord(filterOp.id, formattedDate, data.get('mileage'), motohours, 0, 0, false, 'Автоматически вместе с заменой масла', '');
                        }
                    }
                }

                // Автоматическая отметка фильтра вариатора
                if (currentOpName.includes('Масло CVT (частичная)')) {
                    const filterOp = operations.find(o => o.name.includes('Фильтр вариатора'));
                    if (filterOp) {
                        const today = formattedDate;
                        const alreadyDone = serviceRecords.some(rec => 
                            rec.operation_id === filterOp.id && rec.date === today
                        );
                        if (!alreadyDone) {
                            await addServiceRecord(filterOp.id, formattedDate, data.get('mileage'), motohours, 0, 0, false, 'Автоматически вместе с частичной заменой масла', '');
                        }
                    }
                }
            } catch (error) {
                console.error('Ошибка при сохранении ТО:', error);
                alert('Не удалось сохранить запись. Проверьте консоль (F12).');
            }
        })();
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

function openOperationForm(op = null) {
    const modal = createModal(op ? '✏️ Редактировать' : '➕ Новая операция', `
        <form id="op-form"><input type="hidden" name="id" value="${op?.id||''}"><input type="hidden" name="rowIndex" value="${op?.rowIndex||''}">
            <label>Категория</label>
            <select name="category" required>
                <option value="ДВС" ${op?.category === 'ДВС' ? 'selected' : ''}>ДВС</option>
                <option value="Вариатор" ${op?.category === 'Вариатор' ? 'selected' : ''}>Вариатор</option>
                <option value="Тормозная система" ${op?.category === 'Тормозная система' ? 'selected' : ''}>Тормозная система</option>
                <option value="Подвеска" ${op?.category === 'Подвеска' ? 'selected' : ''}>Подвеска</option>
                <option value="Зажигание" ${op?.category === 'Зажигание' ? 'selected' : ''}>Зажигание</option>
                <option value="Охлаждение" ${op?.category === 'Охлаждение' ? 'selected' : ''}>Охлаждение</option>
                <option value="ГРМ" ${op?.category === 'ГРМ' ? 'selected' : ''}>ГРМ</option>
                <option value="Навесное" ${op?.category === 'Навесное' ? 'selected' : ''}>Навесное</option>
                <option value="Трансмиссия" ${op?.category === 'Трансмиссия' ? 'selected' : ''}>Трансмиссия</option>
                <option value="Топливная система" ${op?.category === 'Топливная система' ? 'selected' : ''}>Топливная система</option>
                <option value="Сезонное" ${op?.category === 'Сезонное' ? 'selected' : ''}>Сезонное</option>
                <option value="Документы" ${op?.category === 'Документы' ? 'selected' : ''}>Документы</option>
                <option value="Прочее" ${op?.category === 'Прочее' ? 'selected' : ''}>Прочее</option>
            </select>
            <label>Название</label><input type="text" name="name" value="${op?.name||''}" required>
            <label>Интервал, км</label><input type="number" name="km" value="${op?.intervalKm||''}">
            <label>Интервал, мес</label><input type="number" name="months" value="${op?.intervalMonths||''}">
            <label>Интервал, моточасов</label><input type="number" name="moto" value="${op?.intervalMotohours||''}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#op-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(form));
        modal.remove();
        saveOperation(formData).catch(e => console.warn('Ошибка сохранения операции:', e));
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

function openCarSelectModal() {
    loadProfiles();
    let optionsHtml = '';
    carProfiles.forEach((p, index) => {
        optionsHtml += `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="radio" name="carProfile" value="${p.id}" id="profile_${index}" ${p.id === currentProfileId ? 'checked' : ''}>
                <input type="text" id="name_${index}" value="${p.name}" style="flex:1;" placeholder="Имя авто">
                <button class="icon-btn delete-profile-btn" data-id="${p.id}">🗑️</button>
            </div>
        `;
    });
    optionsHtml += `
        <div style="margin-top:16px;">
            <label>Новый автомобиль (вставьте ID):</label>
            <input type="text" id="new-profile-id" placeholder="ID таблицы Google Sheets">
        </div>
    `;

    const modal = createModal('🚗 Выбор автомобиля', `
        <form id="car-select-form">
            ${optionsHtml}
            <div class="modal-actions">
                <button type="submit" class="primary-btn">Загрузить</button>
                <button type="button" class="cancel-btn secondary-btn">Отмена</button>
            </div>
        </form>
    `);

    // Обработчики удаления
    modal.querySelectorAll('.delete-profile-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = btn.dataset.id;
            carProfiles = carProfiles.filter(p => p.id !== id);
            saveProfiles();
            modal.remove();
            openCarSelectModal(); // переоткрыть с обновлённым списком
        });
    });

    const form = modal.querySelector('#car-select-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        // Проверяем, выбран ли существующий или новый
        const selectedRadio = form.querySelector('input[name="carProfile"]:checked');
        let selectedId;
        if (selectedRadio) {
            selectedId = selectedRadio.value;
            // Обновляем имена для существующих
            carProfiles.forEach((p, index) => {
                const nameInput = document.getElementById(`name_${index}`);
                if (nameInput) p.name = nameInput.value || p.name;
            });
            saveProfiles();
        } else {
            // Новый ID
            selectedId = document.getElementById('new-profile-id').value.trim();
            if (!selectedId) {
                alert('Выберите существующий профиль или введите новый ID');
                return;
            }
            addOrUpdateProfile(selectedId, 'Новый автомобиль');
        }
        modal.remove();
        loadProfileById(selectedId);
    };

    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

// ==================== 11. СОХРАНЕНИЕ ====================
async function addServiceRecord(opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl) {
    const op = operations.find(o => o.id == opId);
    if (!op) return;
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

async function saveOperation(data) {
    const category = data.category;
    const name = data.name;
    const km = data.km || '';
    const months = data.months || '';
    const moto = data.moto || '';
    const rowIndex = parseInt(data.rowIndex, 10);
    const id = data.id;

    const existingOp = operations.find(o => o.id == id);
    const lastDate = existingOp ? existingOp.lastDate || '' : '';
    const lastMileage = existingOp ? existingOp.lastMileage || '' : '';
    const lastMotohours = existingOp ? existingOp.lastMotohours || '' : '';

    const rowData = [category, name, lastDate, lastMileage, lastMotohours, km, months, moto];

    if (id && !isNaN(rowIndex) && rowIndex >= 2) {
        await writeSheet(`Журнал ТО!A${rowIndex}:H${rowIndex}`, [rowData]);

        const op = operations.find(o => o.id == id);
        if (op) {
            op.category = category;
            op.name = name;
            op.intervalKm = parseInt(km) || 0;
            op.intervalMonths = parseInt(months) || 0;
            op.intervalMotohours = moto ? parseInt(moto) : null;
        }

        renderTOTable();
        
        setTimeout(() => {
            loadSheet().catch(e => console.warn('Фоновая синхронизация не удалась:', e));
        }, 100);
    } else {
        await appendSheet('Журнал ТО!A:H', [rowData]);
        await loadSheet();
    }
}
// ==================== 12. ОФЛАЙН ====================
function addPendingAction(action) {
    pendingActions.push(action);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingActions));
    setSyncStatus('error');
}

async function syncPendingActions() {
    if (!isOnline || !accessToken || pendingActions.length === 0) return;
    setSyncStatus('syncing');
    const actions = [...pendingActions];
    for (const action of actions) {
        try {
            if (action.type === 'service') {
                await writeSheet(`Журнал ТО!C${action.rowIndex}:E${action.rowIndex}`, [[action.date, action.mileage, action.motohours]]);
                await appendSheet('История!A:A', [[action.opId, action.date, action.mileage, action.motohours, action.partsCost, action.workCost, action.isDIY, action.notes, action.photoUrl, new Date().toISOString()]]);
                await appendSheet('WorkCosts!A:D', [[action.opId, action.workCost, action.isDIY, action.notes]]);
            }
            pendingActions = pendingActions.filter(a => a !== action);
        } catch (e) { console.warn(e); }
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(pendingActions));
    if (pendingActions.length === 0) setSyncStatus('synced');
    await loadSheet();
}
// ==================== 13. ФОТО ====================
async function getOrCreatePhotoFolder() {
    const query = encodeURIComponent("name='Vesta_TO_Photos' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const res = await apiCall(`https://www.googleapis.com/drive/v3/files?q=${query}`);
    if (res.files.length > 0) return res.files[0].id;
    const metadata = { name: 'Vesta_TO_Photos', mimeType: 'application/vnd.google-apps.folder' };
    const createRes = await apiCall('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify(metadata) });
    return createRes.id;
}

async function uploadPhoto(file) {
    const metadata = { name: `${new Date().toISOString()}_${file.name}`, mimeType: file.type, parents: [driveFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form
    });
    const data = await res.json();
    return `https://drive.google.com/file/d/${data.id}/view`;
}


// ==================== 14. УВЕДОМЛЕНИЯ ====================
async function sendNotification(title, body, tag = null) {
    if (settings.notificationMethod === 'telegram' || settings.notificationMethod === 'both') await sendTelegramMessage(`${title}\n${body}`);
    if (settings.notificationMethod === 'push' || settings.notificationMethod === 'both') await sendPushNotification(title, body, tag);
}

async function sendTelegramMessage(text) {
    if (!settings.telegramToken || !settings.telegramChatId) return;
    try {
        await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: settings.telegramChatId, text: text })
        });
    } catch (e) {}
}

async function sendPushNotification(title, body, tag) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, { body, tag, icon: 'icon-192.png' });
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert('Push не поддерживается'); return; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { alert('Нет разрешения'); return; }
    localStorage.setItem('push_subscribed', 'true');
    pushStatus.textContent = '✅ Push активны';
}

// ==================== 15. ГОЛОС ====================
function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Не поддерживается'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU'; recognition.interimResults = false;
    recognition.start();
    recognition.onresult = (e) => parseFuelVoice(e.results[0][0].transcript);
    recognition.onerror = (e) => {
        if (e.error === 'not-allowed') {
            alert('Доступ к микрофону запрещён. Разрешите использование микрофона в настройках браузера.');
        } else {
            alert('Ошибка распознавания: ' + e.error);
        }
    };
}

function parseFuelVoice(text) {
    const numbers = text.match(/\d+(?:[.,]\d+)?/g);
    if (!numbers || numbers.length < 2) { alert('Скажите пробег и литры'); return; }
    openFuelModal({ mileage: parseInt(numbers[0]), liters: parseFloat(numbers[1]), pricePerLiter: numbers[2] ? parseFloat(numbers[2]) : null });
}

function openFuelModal(record = null) {
    const isEdit = !!(record && record.rowIndex);
    let defaultDate;
    if (record && record.date) {
        defaultDate = isoToDDMMYYYY(record.date);
    } else {
        const todayISO = new Date().toISOString().split('T')[0];
        defaultDate = isoToDDMMYYYY(todayISO);
    }
    const mileageValue = record && record.mileage ? record.mileage : settings.currentMileage;
    const litersValue = record && record.liters ? record.liters : '';
    const priceValue = record && record.pricePerLiter ? record.pricePerLiter : '';
    const notesValue = record && record.notes ? record.notes : '';
    const fullTankChecked = record && record.fullTank ? 'checked' : '';
    const fuelTypeValue = record && record.fuelType ? record.fuelType : 'Бензин';

    const modal = createModal(isEdit ? '✏️ Редактировать заправку' : '⛽ Добавить заправку', `
        <form id="fuel-form">
            ${isEdit ? `<input type="hidden" name="rowIndex" value="${record.rowIndex}">` : ''}
            <label>Дата (ДД-ММ-ГГГГ)</label>
            <input type="text" name="date" placeholder="ДД-ММ-ГГГГ" pattern="\\d{2}-\\d{2}-\\d{4}" required oninput="applyDateMaskDDMMYYYY(event)" value="${defaultDate}">
            <label>Пробег</label><input type="number" name="mileage" value="${mileageValue}" required>
            <label>Литры</label><input type="number" name="liters" step="0.01" value="${litersValue}" required>
            <label>Цена/л</label><input type="number" name="pricePerLiter" step="0.01" value="${priceValue}">
            <label>Полный бак? <input type="checkbox" name="fullTank" value="true" ${fullTankChecked}></label>
            <label>Тип топлива</label>
            <select name="fuelType">
                <option value="Бензин" ${fuelTypeValue === 'Бензин' ? 'selected' : ''}>Бензин</option>
                <option value="Дизель" ${fuelTypeValue === 'Дизель' ? 'selected' : ''}>Дизель</option>
                <option value="Газ (ГБО)" ${fuelTypeValue === 'Газ (ГБО)' ? 'selected' : ''}>Газ (ГБО)</option>
                <option value="Электричество" ${fuelTypeValue === 'Электричество' ? 'selected' : ''}>Электричество</option>
            </select>
            <label>Примечание</label><input type="text" name="notes" value="${notesValue}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#fuel-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        const rowIndex = d.rowIndex;
        const dateISO = ddmmYYYYtoISO(d.date);
        const rowData = [dateISO, d.mileage, d.liters, d.pricePerLiter, d.fullTank || '', d.fuelType, d.notes || ''];
        modal.remove();
        if (isEdit) {
            writeSheet(`FuelLog!A${rowIndex}:G${rowIndex}`, [rowData])
                .then(() => loadSheet())
                .catch(e => console.warn('Ошибка обновления заправки:', e));
        } else {
            appendSheet('FuelLog!A:G', [rowData])
                .then(() => loadSheet())
                .catch(e => console.warn('Ошибка сохранения заправки:', e));
        }
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

// ==================== 16. СТАТИСТИКА ====================
function renderStats() {
    const oilOp = operations.find(op => op.name.includes('Масло') && op.category.includes('ДВС'));
    if (oilOp)  {
        const plan = calculatePlan(oilOp);
        const canvas = oilChart;
        if (canvas) {
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
        }
    }
}

// Преобразование серийного числа Excel (дней от 30.12.1899) в YYYY-MM-DD
function excelDateToISO(serial) {
    if (!serial || typeof serial !== 'number') return '';
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400000);
    return date.toISOString().split('T')[0];
}

// ==================== 17. ИСТОРИЯ ====================
function excelDateToISO(serial) {
    if (!serial || typeof serial !== 'number') return '';
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400000);
    return date.toISOString().split('T')[0];
}

async function loadHistory() {
    if (!spreadsheetId) return;
    try {
        const rawData = await readSheet('История!A2:J');
        const validRows = [];
        const historyData = [];
        rawData.forEach((row, idx) => {
            if (row.some(cell => cell !== '' && cell !== null && cell !== undefined)) {
                historyData.push(row);
                validRows.push(idx + 2);
            }
        });

        serviceRecords = historyData.map(row => ({
            operation_id: row[0],
            date: typeof row[1] === 'number' ? excelDateToISO(row[1]) : row[1],
            mileage: row[2],
            motohours: row[3],
            parts_cost: row[4],
            work_cost: row[5],
            is_diy: row[6],
            notes: row[7],
            photo_url: row[8],
            timestamp: row[9]
        }));

        const tbody = historyBody;
        if (!tbody) return;
        tbody.innerHTML = '';
        historyData.reverse().forEach((row, displayIndex) => {
            const physicalRow = validRows[historyData.length - 1 - displayIndex];
            const tr = document.createElement('tr');
            const opId = row[0];
            const op = operations.find(o => o.id == opId) || { name: 'Неизвестно' };
            const formattedDate = typeof row[1] === 'number' ? excelDateToISO(row[1]) : row[1] || '';
            const diyFlag = row[6] === 'TRUE' || row[6] === true;
            tr.innerHTML = `
                <td>${formattedDate}</td>
                <td>${op.name}</td>
                <td>${row[2] || ''}</td>
                <td>${row[3] || ''}</td>
                <td>${row[4] || ''}</td>
                <td>${row[5] || ''}</td>
                <td>${row[7] || ''}</td>
                <td style="text-align:center;">${diyFlag ? '✅' : '—'}</td>
                <td>
                    <button class="icon-btn edit-history-btn" data-row="${physicalRow}" data-opid="${opId}" data-date="${formattedDate}" data-mileage="${row[2]}" data-motohours="${row[3]}" data-parts="${row[4]}" data-work="${row[5]}" data-diy="${row[6]}" data-notes="${row[7]}" data-photo="${row[8]}">✏️</button>
                    <button class="icon-btn delete-history-btn" data-row="${physicalRow}">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        document.querySelectorAll('.edit-history-btn').forEach(b => b.addEventListener('click', openHistoryEdit));
        document.querySelectorAll('.delete-history-btn').forEach(b => b.addEventListener('click', deleteHistoryEntry));
    } catch (e) {
        console.warn('История не загружена:', e);
    }
}

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

async function deleteHistoryEntry(e) {
    const btn = e.currentTarget;
    const rowIndex = btn.dataset.row;
    if (!confirm('Удалить запись из истории? Это действие нельзя отменить.')) return;
    await writeSheet(`История!A${rowIndex}:J${rowIndex}`, [['','','','','','','','','','']]);
    loadHistory();
}

// ==================== 18. ОБРАБОТЧИКИ ====================
function attachTOListeners() {
    document.querySelectorAll('.add-record-btn').forEach(b => b.addEventListener('click', e => openServiceModal(b.dataset.opId, b.dataset.opName)));
    document.querySelectorAll('.edit-op-btn').forEach(b => b.addEventListener('click', e => openOperationForm(operations.find(o => o.id == b.dataset.opId))));
    document.querySelectorAll('.calendar-btn').forEach(b => b.addEventListener('click', e => addToCalendar(b.dataset.opName, b.dataset.planDate, b.dataset.planMileage)));
    document.querySelectorAll('.shopping-list-btn').forEach(b => b.addEventListener('click', e => generateShoppingList(b.dataset.opId)));
}

function attachPartsListeners() {
    document.querySelectorAll('.edit-part-btn').forEach(b => b.addEventListener('click', e => { const part = parts.find(p => p.id == b.dataset.id); openPartForm(part); }));
    document.querySelectorAll('.delete-part-btn').forEach(b => b.addEventListener('click', async e => { if (confirm('Удалить запчасть?')) { await writeSheet(`PartsCatalog!A${b.dataset.id}:G${b.dataset.id}`, [['','','','','','','']]); await loadSheet(); } }));
    document.querySelectorAll('.search-part-btn').forEach(b => b.addEventListener('click', e => { if (b.dataset.oem) window.open(`https://exist.ru/price/?pcode=${b.dataset.oem}`, '_blank'); }));
}

function attachFuelListeners() {
    // Удаление
    document.querySelectorAll('.delete-fuel-btn').forEach(b => {
        b.addEventListener('click', async e => {
            const index = b.dataset.index;
            if (!confirm('Удалить заправку?')) return;
            const rowIndex = parseInt(index) + 2;
            await writeSheet(`FuelLog!A${rowIndex}:G${rowIndex}`, [['','','','','','','']]);
            await loadSheet();
        });
    });
    // Редактирование
    document.querySelectorAll('.edit-fuel-btn').forEach(b => {
        b.addEventListener('click', e => {
            const index = b.dataset.index;
            const record = fuelLog[index];
            if (record) {
                record.rowIndex = parseInt(index) + 2;
                openFuelModal(record);
            }
        });
    });
}

async function addToCalendar(opName, planDate, planMileage) {
    if (!accessToken) { alert('Авторизуйтесь'); return; }
    let minutesBefore = 14 * 24 * 60;
    if (opName.includes('ОСАГО')) minutesBefore = 1 * 24 * 60;
    const event = { summary: `🔧 ТО: ${opName}`, description: `Пробег: ${planMileage} км`, start: { date: planDate }, end: { date: planDate }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: minutesBefore }] } };
    try { await apiCall('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(event) }); alert(`✅ Добавлено в календарь`); } catch (e) { alert(`❌ Ошибка`); }
}

function generateShoppingList(opId) {
    const op = operations.find(o => o.id == opId);
    const items = parts.filter(p => p.operation === op.name || p.operation === op.category);
    if (!items.length) { alert('Нет запчастей'); return; }
    let list = `🛒 ${op.name}:\n`; items.forEach(p => { list += `- ${p.oem || p.analog} ${p.price ? p.price+'₽' : ''}\n`; }); alert(list);
}

function openPartForm(part = null) {
    const modal = createModal(part ? '✏️ Запчасть' : '➕ Запчасть', `
        <form id="part-form"><input type="hidden" name="id" value="${part?.id||''}">
            <label>Операция</label><input type="text" name="operation" value="${part?.operation||''}" required>
            <label>OEM</label><input type="text" name="oem" value="${part?.oem||''}">
            <label>Аналог</label><input type="text" name="analog" value="${part?.analog||''}">
            <label>Цена</label><input type="number" name="price" step="0.01" value="${part?.price||''}">
            <label>Поставщик</label><input type="text" name="supplier" value="${part?.supplier||''}">
            <label>Ссылка</label><input type="url" name="link" value="${part?.link||''}">
            <label>Комментарий</label><input type="text" name="comment" value="${part?.comment||''}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#part-form');
    form.onsubmit = async (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(form)); const row = [d.operation, d.oem, d.analog, d.price, d.supplier, d.link, d.comment]; if (part) await writeSheet(`PartsCatalog!A${part.id}:G${part.id}`, [row]); else await appendSheet('PartsCatalog!A:G', [row]); modal.remove(); await loadSheet(); };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

async function saveSettings() {
    settings.currentMileage = +setMileage?.value || settings.currentMileage;
    settings.currentMotohours = +setMotohours?.value || settings.currentMotohours;
    settings.telegramToken = telegramTokenInput.value;
    settings.telegramChatId = telegramChatIdInput.value;
    settings.notificationMethod = notificationMethodSelect.value;
    localStorage.setItem('notificationMethod', settings.notificationMethod);
    
    baseMileage = +document.getElementById('set-base-mileage').value || 0;
    baseMotohours = +document.getElementById('set-base-motohours').value || 0;
    purchaseDate = document.getElementById('purchase-date').value;
    calculateOwnershipDays();
    
    await writeSheet('Журнал ТО!Q1:Q12', [
        [settings.currentMileage],
        [settings.currentMotohours],
        [settings.avgDailyMileage],
        [settings.avgDailyMotohours],
        [], [], [settings.telegramToken], [settings.telegramChatId],
        [baseMileage], [baseMotohours], [purchaseDate], []
    ]);
    
    document.getElementById('settings-result').textContent = '✅ Сохранено';
}

function exportData() {
    const data = { operations, settings, parts, fuelLog, tireLog, workCosts };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vesta_${new Date().toISOString().split('T')[0]}.json`; a.click();
}

function importData(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => { try { const d = JSON.parse(ev.target.result); operations = d.operations; settings = d.settings; parts = d.parts || []; fuelLog = d.fuelLog || []; tireLog = d.tireLog || []; workCosts = d.workCosts || []; renderAll(); if (isOnline) await syncAllToSheet(); } catch (err) { alert('Ошибка импорта'); } };
    reader.readAsText(file); e.target.value = '';
}

async function syncAllToSheet() {
    const opsRows = operations.map(o => [o.category, o.name, o.lastDate||'', o.lastMileage||'', o.lastMotohours||'', o.intervalKm, o.intervalMonths, o.intervalMotohours||'']);
    await writeSheet('Журнал ТО!A2:H', opsRows);
    await writeSheet('Журнал ТО!Q1:Q12', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours],[],[],[settings.telegramToken],[settings.telegramChatId],[baseMileage],[baseMotohours],[purchaseDate],[]]);
}

// ==================== 19. ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ====================
function initEventListeners() {
    authBtn.addEventListener('click', (e) => { e.preventDefault(); startAuth(); });
    loadSheetBtn.onclick = loadSheet;
    recalculateBtn.onclick = () => { renderTOTable(); renderTop5Widget(); };
    exportBtn.onclick = exportData;
    importBtn.onclick = () => importFile.click();
    importFile.onchange = importData;
    addOperationBtn.onclick = () => openOperationForm();
    addPartBtn.onclick = () => openPartForm();
    addFuelBtn.onclick = () => openFuelModal({});
    voiceFuelBtn.onclick = startVoiceInput;
    saveSettingsBtn.onclick = saveSettings;
    subscribePushBtn.onclick = subscribeToPush;
    openPhotoFolderBtn.onclick = async () => {
        if (!driveFolderId) driveFolderId = await getOrCreatePhotoFolder();
        if (driveFolderId) window.open(`https://drive.google.com/drive/folders/${driveFolderId}`, '_blank');
        else alert('Папка с фото ещё не создана. Загрузите первое фото.');
    };
    shareTableBtn.onclick = () => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank');
    themeToggle.onclick = () => { document.body.classList.toggle('dark'); themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙'; };

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            if (btn.dataset.tab === 'history') loadHistory();
            if (btn.dataset.tab === 'stats') renderStats();
            if (btn.dataset.tab === 'to') renderTop5Widget();
        });
    });

    window.addEventListener('online', () => { isOnline = true; syncPendingActions(); setSyncStatus('synced'); });
    window.addEventListener('offline', () => { isOnline = false; setSyncStatus('error'); });

    addTireBtn.onclick = () => {
        const type = prompt('Введите тип резины (лето/зима):'); if (!type) return;
        const date = new Date().toISOString().split('T')[0];
        appendSheet('Tires!A:D', [[date, type, settings.currentMileage, '']]); loadSheet();
    };

    // v2.1: Обработчик кнопки "Обновить"
    const updateBtn = document.getElementById('update-mileage-btn');
    if (updateBtn) updateBtn.addEventListener('click', updateMileageAndAverages);
}
// ==================== 20. ОБНОВЛЕНИЕ ПРОБЕГА И ДНИ ВЛАДЕНИЯ ====================
async function updateMileageAndAverages() {
    const newMileageInput = document.getElementById('new-mileage');
    const newMotohoursInput = document.getElementById('new-motohours');
    if (!newMileageInput || !newMotohoursInput) {
        alert('Поля ввода пробега не найдены. Обновите интерфейс до версии v2.2.');
        return;
    }
    const newMileage = parseFloat(newMileageInput.value);
    const newMotohours = parseFloat(newMotohoursInput.value);
    if (isNaN(newMileage) || isNaN(newMotohours)) {
        alert('Введите корректные числовые значения');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    await appendSheet('MileageLog!A:C', [[today, newMileage, newMotohours]]);
    
    mileageHistory.push({ date: today, mileage: newMileage, motohours: newMotohours });
    mileageHistory.sort((a,b) => new Date(a.date) - new Date(b.date));
    
    if (mileageHistory.length >= 2) {
        const last = mileageHistory[mileageHistory.length - 1];
        const prev = mileageHistory[mileageHistory.length - 2];
        const daysDiff = (new Date(last.date) - new Date(prev.date)) / 86400000;
        if (daysDiff > 0) {
            settings.avgDailyMileage = (last.mileage - prev.mileage) / daysDiff;
            settings.avgDailyMotohours = (last.motohours - prev.motohours) / daysDiff;
        }
    } else {
        settings.avgDailyMileage = baseMileage > 0 ? (newMileage - baseMileage) / 30 : 20;
        settings.avgDailyMotohours = baseMotohours > 0 ? (newMotohours - baseMotohours) / 30 : 1.65;
    }
    
    settings.currentMileage = newMileage;
    settings.currentMotohours = newMotohours;
    
    await writeSheet('Журнал ТО!Q1:Q4', [
        [settings.currentMileage],
        [settings.currentMotohours],
        [settings.avgDailyMileage],
        [settings.avgDailyMotohours]
    ]);
    
    renderAll();
    updateNextServiceWidget();
    renderTop5Widget();
    alert('Показатели обновлены');
}

function calculateOwnershipDays() {
    const daysInput = document.getElementById('ownership-days');
    if (!daysInput) return;
    if (!purchaseDate) {
        ownershipDays = 0;
        daysInput.value = '';
        return;
    }
    const today = new Date();
    const purchase = new Date(purchaseDate);
    const diffTime = Math.abs(today - purchase);
    ownershipDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    daysInput.value = ownershipDays;
}
// ==================== 20-А. ВИДЖЕТ ТОП-5 С ГРУППИРОВКОЙ И ПРИОРИТЕТОМ МОТОЧАСОВ ====================
const LINKED_PAIRS = [
    { main: 'Масло', linked: 'Масляный фильтр', combinedName: 'Масло + фильтр' },
    { main: 'Масло CVT (частичная)', linked: 'Фильтр вариатора', combinedName: 'Масло CVT + фильтр' }
];

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

                groupedOps.push({
                    name: pair.combinedName,
                    op: primaryOp,
                    plan: primaryPlan,
                    isGroup: true
                });
                usedIds.add(op.id);
                usedIds.add(linkedOp.id);
                continue;
            }
        }

        let isLinkedInPair = false;
        for (const p of LINKED_PAIRS) {
            if (op.name === p.linked) {
                isLinkedInPair = true;
                break;
            }
        }
        if (isLinkedInPair) {
            const mainOp = candidates.find(o => o.name === LINKED_PAIRS.find(p => p.linked === op.name)?.main);
            if (mainOp && !usedIds.has(mainOp.id)) continue;
        }

        if (!usedIds.has(op.id)) {
            groupedOps.push({
                name: op.name,
                op: op,
                plan: calculatePlan(op),
                isGroup: false
            });
            usedIds.add(op.id);
        }
    }

    const sorted = groupedOps.sort((a, b) => a.plan.daysLeft - b.plan.daysLeft);
    const top5 = sorted.slice(0, 5);

    let html = '';
    top5.forEach(item => {
        const op = item.op;
        const plan = item.plan;

        // Проверка свежести моточасов для масла ДВС (дублируем логику)
        let motoFresh = true;
        if (op.name.includes('Масло') && op.category.includes('ДВС')) {
            if (mileageHistory.length >= 1) {
                const lastEntry = mileageHistory[mileageHistory.length - 1];
                const motoDiff = settings.currentMotohours - lastEntry.motohours;
                const mileageDiff = settings.currentMileage - lastEntry.mileage;
                if (motoDiff > 20 || mileageDiff > 500) {
                    motoFresh = false;
                }
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

