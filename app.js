// ==================== 1. КОНФИГУРАЦИЯ ====================
const CLIENT_ID = '593689755085-9llh88kf9pvedbcpfumifq4gkj0kh248.apps.googleusercontent.com';
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

// ==================== 2-А. ДОПОЛНИТЕЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let mileageHistory = [];
let baseMileage = 0;
let baseMotohours = 0;
let purchaseDate = '';
let ownershipDays = 0;
let ownershipDisplayMode = 'days';

// ==================== 2-Б. ПРОФИЛИ АВТОМОБИЛЕЙ ====================
let carProfiles = [];
let currentProfileId = '';
const PROFILES_KEY = 'vesta_car_profiles';

// ==================== 3. DOM ЭЛЕМЕНТЫ ====================
const authPanel = document.getElementById('auth-panel');
const authBtn = document.getElementById('authorize-btn');
const authStatus = document.getElementById('auth-status');
const dataPanel = document.getElementById('data-panel');
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
function loadProfiles() {
    const stored = localStorage.getItem(PROFILES_KEY);
    if (stored) {
        try { carProfiles = JSON.parse(stored); } catch (e) { carProfiles = []; }
    }
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
        carProfiles.push({ id: id, name: name || 'Мой автомобиль', lastUsed: now });
    }
    carProfiles.sort((a, b) => b.lastUsed - a.lastUsed);
    saveProfiles();
    currentProfileId = id;
}

function getLastUsedProfileId() {
    loadProfiles();
    return carProfiles.length > 0 ? carProfiles[0].id : null;
}

async function loadProfileById(id) {
    if (!id) return;
    spreadsheetId = id;
    currentProfileId = id;
    await loadSheet();
    addOrUpdateProfile(id);
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

// ==================== 7. ТОСТЫ, СКЕЛЕТОНЫ, ИКОНКИ ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showSkeleton(targetId, type = 'table') {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = '';
    if (type === 'table') {
        for (let i = 0; i < 5; i++) {
            const row = document.createElement('div');
            row.className = 'skeleton skeleton-table-row';
            row.style.width = '100%';
            target.appendChild(row);
        }
    } else if (type === 'stats') {
        for (let i = 0; i < 4; i++) {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = '<div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div>';
            target.appendChild(card);
        }
    }
}

function hideSkeleton(targetId) {
    const target = document.getElementById(targetId);
    if (target) target.innerHTML = '';
}

function initIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// ==================== 7. ЗАГРУЗКА ДАННЫХ (с поддержкой склада) ====================
async function loadSheet() {
    if (!spreadsheetId) return;
    localStorage.setItem('vesta_spreadsheet_id', spreadsheetId);
    setSyncStatus('syncing');
    showSkeleton('table-body', 'table');
    showSkeleton('stats-summary-grid', 'stats');
    try {
        const [opsData, settingsData, partsData, tiresData, workCostsData] = await Promise.all([
            readSheet('Журнал ТО!A2:H'),
            readSheet('Журнал ТО!Q1:Q8'),
            readSheet('PartsCatalog!A2:I').catch(() => []),
            readSheet('Tires!A2:J').catch(() => []),
            readSheet('WorkCosts!A2:D').catch(() => [])
        ]);

        operations = opsData.filter(r => r[1]).map((r, i) => {
            let lastDate = null;
            if (r[2]) { const p = new Date(r[2]); lastDate = isNaN(p) ? null : p.toISOString().split('T')[0]; }
            return {
                id: i+2, rowIndex: i+2, category: r[0]||'', name: r[1],
                intervalKm: +r[5]||0, intervalMonths: +r[6]||0, intervalMotohours: r[7]?+r[7]:null,
                lastDate, lastMileage: +r[3]||0, lastMotohours: +r[4]||0
            };
        });

        if (settingsData.length >= 8) {
            settings.currentMileage = +settingsData[0][0]||0;
            settings.currentMotohours = +settingsData[1][0]||0;
            settings.avgDailyMileage = +settingsData[2][0]||45;
            settings.avgDailyMotohours = +settingsData[3][0]||1.8;
            settings.telegramToken = settingsData[6]?.[0]||'';
            settings.telegramChatId = settingsData[7]?.[0]||'';
        }

        parts = partsData.map((r,i)=>({
            id:i+2, operation:r[0]||'', oem:r[1]||'', analog:r[2]||'',
            price:r[3]||'', supplier:r[4]||'', link:r[5]||'', comment:r[6]||'',
            inStock: r[7] ? parseFloat(r[7]) : 0,
            location: r[8] || ''
        }));

        const fuelData = await readSheet('FuelLog!A2:G').catch(()=>[]);
        fuelLog = fuelData.map(r=>({
            date: typeof r[0]==='number'?excelDateToISO(r[0]):r[0], mileage:+r[1], liters:+r[2],
            pricePerLiter:+r[3], fullTank:r[4], fuelType:r[5]||'Бензин', notes:r[6]
        })).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

        tireLog = tiresData.map(r=>({
            date: typeof r[0]==='number'?excelDateToISO(r[0]):r[0], type:r[1]||'', mileage:+r[2]||0,
            model:r[3]||'', size:r[4]||'', wear:r[5]||'', notes:r[6]||'',
            purchaseCost:+r[7]||0, mountCost:+r[8]||0, isDIY:r[9]==='TRUE'||r[9]===true
        })).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

        workCosts = workCostsData.map(r=>({ operationId:+r[0], cost:+r[1], isDIY:r[2]==='TRUE', notes:r[3] }));

        const mileageData = await readSheet('MileageLog!A2:C').catch(()=>[]);
        mileageHistory = mileageData.map(r=>({ date:r[0], mileage:+r[1], motohours:+r[2] }))
            .sort((a,b)=>new Date(a.date)-new Date(b.date));

        const extraSettings = await readSheet('Журнал ТО!Q9:Q12').catch(()=>[]);
        if (extraSettings.length>=4) {
            baseMileage = +extraSettings[0][0]||0;
            baseMotohours = +extraSettings[1][0]||0;
            purchaseDate = extraSettings[2]?.[0]||'';
        }
        calculateOwnershipDays();

        localStorage.setItem(CACHE_KEY, JSON.stringify({ operations, settings, parts, fuelLog, tireLog, workCosts }));
        dataPanel.style.display = 'block';
        setSyncStatus('synced');
        syncPendingActions();
        driveFolderId = await getOrCreatePhotoFolder();
        loadHistory();
        addOrUpdateProfile(spreadsheetId);
        renderAll();
        hideSkeleton('table-body');
        hideSkeleton('stats-summary-grid');
    } catch (e) {
        setSyncStatus('error');
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const d = JSON.parse(cached);
            operations=d.operations; settings=d.settings; parts=d.parts||[];
            fuelLog=d.fuelLog||[]; tireLog=d.tireLog||[]; workCosts=d.workCosts||[];
            dataPanel.style.display = 'block';
            renderAll();
            hideSkeleton('table-body');
            hideSkeleton('stats-summary-grid');
        }
    }
}

// ==================== 8. РАСЧЁТ ПЛАНОВ ====================
function getOilMotohoursInterval(op, avgSpeed) {
    if (op.name.includes('Масло') && op.category.includes('ДВС')) return avgSpeed < 20 ? 200 : 250;
    return op.intervalMotohours;
}

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
function renderAll() {
    if (!dataPanel || dataPanel.style.display !== 'block') return;
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
    initIcons();
}

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
            let statusClass = '';
            let statusText = '';
            if (plan.daysLeft < 0) {
                statusClass = 'overdue';
                statusText = `⚠️ ${Math.abs(plan.daysLeft)} дн.`;
            } else if (plan.daysLeft <= 10) {
                statusClass = 'critical';
                statusText = `${plan.daysLeft} дн.`;
            } else if (plan.daysLeft <= 20) {
                statusClass = 'warning';
                statusText = `${plan.daysLeft} дн.`;
            } else if (plan.daysLeft <= 30) {
                statusClass = 'attention';
                statusText = `${plan.daysLeft} дн.`;
            } else {
                statusText = `${plan.daysLeft} дн.`;
            }
            const cacheKey = `${op.name}|${plan.planDate}`;
            const isAdded = calendarEventCache.get(cacheKey) || false;
            const calendarIcon = isAdded ? '✅' : '📅';
            const calendarTitle = isAdded ? 'Уже в календаре' : 'Добавить в календарь';
            const calendarClass = isAdded ? 'calendar-btn calendar-btn-added' : 'calendar-btn';
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = op.rowIndex;
            tr.dataset.operationId = op.id;
            tr.innerHTML = `
                <td><strong>${escapeHtml(op.name)}</strong></td>
                <td>${op.lastDate ? op.lastDate.split('-').reverse().join('-') : '—'}</td>
                <td>${op.lastMileage || '—'}</td>
                <td>${op.lastMotohours || '—'}</td>
                <td><strong>${plan.planDate.split('-').reverse().join('-')}</strong><br><small>${plan.planMileage} км</small></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="icon-btn add-record-btn" data-op-id="${op.id}" data-op-name="${op.name}"><i data-lucide="plus"></i></button>
                    <button class="icon-btn edit-op-btn" data-op-id="${op.id}"><i data-lucide="pencil"></i></button>
                    <button class="icon-btn ${calendarClass}" data-op-name="${op.name}" data-plan-date="${plan.planDate}" data-plan-mileage="${plan.planMileage}" title="${calendarTitle}">${calendarIcon}</button>
                    <button class="icon-btn shopping-list-btn" data-op-id="${op.id}"><i data-lucide="shopping-cart"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });
    attachTOListeners();
    updateCalendarButtonsStatus();
    initIcons();
}

function renderPartsTable() {
    const tbody = partsBody; if (!tbody) return;
    tbody.innerHTML = '';
    parts.forEach(p => {
        const tr = document.createElement('tr'); tr.dataset.id = p.id;
        tr.innerHTML = `
            <td>${p.operation}</td>
            <td>${p.oem}</td>
            <td>${p.analog}</td>
            <td>${p.price ? p.price+' ₽' : ''}</td>
            <td>${p.supplier}</td>
            <td>${p.link ? `<a href="${p.link}" target="_blank"><i data-lucide="external-link"></i></a>` : ''}</td>
            <td>${p.comment}</td>
            <td style="text-align:center;">${p.inStock || 0}</td>
            <td>${p.location || ''}</td>
            <td>
                <button class="icon-btn edit-part-btn" data-id="${p.id}"><i data-lucide="pencil"></i></button>
                <button class="icon-btn delete-part-btn" data-id="${p.id}"><i data-lucide="trash-2"></i></button>
                <button class="icon-btn search-part-btn" data-oem="${p.oem}"><i data-lucide="search"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    attachPartsListeners();
    initIcons();
}

function renderFuelTable() {
    const tbody = fuelBody; tbody.innerHTML = '';
    fuelLog.forEach((f,i) => {
        if (!f.date) return;
        const tr = document.createElement('tr');
        const fullTankIcon = f.fullTank === 'TRUE' || f.fullTank === true ? '✅' : '';
        tr.innerHTML = `
            <td>${f.date}</td>
            <td>${f.mileage||''}</td>
            <td>${f.liters||''}</td>
            <td>${f.pricePerLiter||''}</td>
            <td style="text-align:center;">${fullTankIcon}</td>
            <td>${f.fuelType||''}</td>
            <td>${f.notes||''}</td>
            <td>
                <button class="icon-btn edit-fuel-btn" data-index="${i}"><i data-lucide="pencil"></i></button>
                <button class="icon-btn delete-fuel-btn" data-index="${i}"><i data-lucide="trash-2"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    attachFuelListeners();
    initIcons();
}

function renderTiresTable() {
    const tbody = tiresBody; tbody.innerHTML = '';
    tireLog.forEach((t,i) => {
        if (!t.date) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td>
            <td>${t.type||''}</td>
            <td>${t.mileage||''}</td>
            <td>${t.model||''}</td>
            <td>${t.size||''}</td>
            <td>${t.wear||''}</td>
            <td>${t.notes||''}</td>
            <td>
                <button class="icon-btn edit-tire-btn" data-index="${i}"><i data-lucide="pencil"></i></button>
                <button class="icon-btn delete-tire-btn" data-index="${i}"><i data-lucide="trash-2"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    attachTireListeners();
    initIcons();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== 9-А. КЭШ КАЛЕНДАРЯ ====================
const CALENDAR_CACHE_KEY = 'vesta_calendar_events';
const calendarEventCache = new Map();
(function(){ try{ const s=localStorage.getItem(CALENDAR_CACHE_KEY); if(s){ JSON.parse(s).forEach(([k,v])=>calendarEventCache.set(k,v)); } }catch(e){} })();
function saveCalendarCache() { localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify([...calendarEventCache])); }
async function checkCalendarEventExists(opName, planDate) {
 if (!accessToken) return false;
 try { const t1=new Date(planDate).toISOString(), t2=new Date(new Date(planDate).setDate(new Date(planDate).getDate()+1)).toISOString(); const res=await apiCall(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${t1}&timeMax=${t2}&q=${encodeURIComponent(opName)}`); return res.items?.length>0; } catch(e){ return false; }
}
async function updateCalendarButtonsStatus() {
 if (!accessToken) return;
 const btns = document.querySelectorAll('.calendar-btn'); if(!btns.length) return;
 const process = async (idx) => { if(idx>=btns.length) return; const b=btns[idx]; const op=b.dataset.opName, d=b.dataset.planDate; if(op&&d){ const key=`${op}|${d}`; if(calendarEventCache.has(key)){ apply(b,calendarEventCache.get(key)); } else { try{ const ex=await checkCalendarEventExists(op,d); calendarEventCache.set(key,ex); saveCalendarCache(); apply(b,ex); }catch(e){ } } } process(idx+1); };
const apply=(b,ex)=>{ b.innerHTML=ex?'✅':'📅'; b.classList[ex?'add':'remove']('calendar-btn-added'); b.title=ex?'Уже в календаре':'Добавить в календарь'; };
 for(let i=0;i<5&&i<btns.length;i++) process(i);
}
async function addToCalendar(opName, planDate, planMileage) {
 if (!accessToken) { alert('Авторизуйтесь'); return; }
 if (await checkCalendarEventExists(opName, planDate)) { alert('Уже есть'); return; }
 const event = { summary:`🔧 ТО: ${opName}`, description:`Пробег: ${planMileage} км.`, start:{date:planDate}, end:{date:planDate}, reminders:{useDefault:false, overrides:[{method:'popup',minutes:15*24*60},{method:'popup',minutes:2*24*60}]} };
 try {
 await apiCall('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method:'POST', body:JSON.stringify(event) });
 alert('✅ Добавлено'); const key=`${opName}|${planDate}`; calendarEventCache.set(key,true); saveCalendarCache();
 const b=document.querySelector(`.calendar-btn[data-op-name="${opName}"][data-plan-date="${planDate}"]`); if(b){ b.innerHTML='✅'; b.classList.add('calendar-btn-added'); b.title='Уже в календаре'; }
 } catch(e) { alert('Ошибка'); }
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
    let input = event.target, value = input.value.replace(/\D/g,''); if(value.length>8) value=value.slice(0,8);
    let formatted = ''; if(value.length>0){ formatted=value.substring(0,4); if(value.length>=5) formatted+='-'+value.substring(4,6); if(value.length>=7) formatted+='-'+value.substring(6,8); }
    input.value = formatted;
};

window.applyDateMaskDDMMYYYY = function(event) {
    let input = event.target, value = input.value.replace(/\D/g,''); if(value.length>8) value=value.slice(0,8);
    let formatted = ''; if(value.length>0){ formatted=value.substring(0,2); if(value.length>=3) formatted+='-'+value.substring(2,4); if(value.length>=5) formatted+='-'+value.substring(4,8); }
    input.value = formatted;
};

function ddmmYYYYtoISO(dateStr) {
    if (!dateStr || !/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split('-'); return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function isoToDDMMYYYY(isoStr) {
    if (!isoStr || isoStr.length !== 10) return isoStr;
    const parts = isoStr.split('-'); return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

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
                const partsForOp = parts.filter(p => p.operation === opName || p.operation === op.category);
                for (const part of partsForOp) {
                    const stock = part.inStock || 0;
                    if (stock > 0) {
                        const newStock = stock - 1;
                        const rowData = [part.operation, part.oem, part.analog, part.price, part.supplier, part.link, part.comment, newStock, part.location];
                        await writeSheet(`PartsCatalog!A${part.id}:I${part.id}`, [rowData]);
                        console.log(`Списана запчасть ${part.oem || part.analog}, остаток: ${newStock}`);
                    }
                }
                if (currentOpName === 'Масло') {
                    const filterOp = operations.find(o => o.name === 'Масляный фильтр' && o.category === 'ДВС');
                    if (filterOp && !serviceRecords.some(rec => rec.operation_id === filterOp.id && rec.date === formattedDate)) {
                        await addServiceRecord(filterOp.id, formattedDate, data.get('mileage'), motohours, 0, 0, false, 'Автоматически вместе с заменой масла', '');
                    }
                }
                if (currentOpName.includes('Масло CVT (частичная)')) {
                    const filterOp = operations.find(o => o.name.includes('Фильтр вариатора'));
                    if (filterOp && !serviceRecords.some(rec => rec.operation_id === filterOp.id && rec.date === formattedDate)) {
                        await addServiceRecord(filterOp.id, formattedDate, data.get('mileage'), motohours, 0, 0, false, 'Автоматически вместе с частичной заменой масла', '');
                    }
                }
                showToast('ТО успешно выполнено', 'success');
            } catch (error) { console.error(error); showToast('Ошибка сохранения', 'error'); }
        })();
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

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

function openCarSelectModal() {
    loadProfiles();
    let optionsHtml = '';
    carProfiles.forEach((p, i) => {
        optionsHtml += `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <input type="radio" name="carProfile" value="${p.id}" id="profile_${i}" ${p.id===currentProfileId?'checked':''}>
                <input type="text" id="name_${i}" value="${p.name}" style="flex:1; min-width:150px" placeholder="Имя авто">
                <button type="button" class="icon-btn delete-profile-btn" data-id="${p.id}"><i data-lucide="trash-2"></i></button>
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

function openPartForm(part = null) {
    const isEdit = !!part;
    const operationOptions = operations.map(op => `<option value="${op.name}" ${part && part.operation === op.name ? 'selected' : ''}>${op.name} (${op.category})</option>`).join('');
    const modal = createModal(isEdit ? '✏️ Запчасть' : '➕ Запчасть', `
        <form id="part-form">
            <input type="hidden" name="id" value="${part?.id || ''}">
            <label>Операция</label><select name="operation" required><option value="">-- Выберите операцию --</option>${operationOptions}</select>
            <label>OEM</label><input type="text" name="oem" value="${part?.oem || ''}">
            <label>Аналог</label><input type="text" name="analog" value="${part?.analog || ''}">
            <label>Цена</label><input type="number" name="price" step="0.01" value="${part?.price || ''}">
            <label>Поставщик</label><input type="text" name="supplier" value="${part?.supplier || ''}">
            <label>Ссылка</label><input type="url" name="link" value="${part?.link || ''}">
            <label>Комментарий</label><input type="text" name="comment" value="${part?.comment || ''}">
            <label>В наличии (шт.)</label><input type="number" name="inStock" min="0" step="1" value="${part?.inStock || 0}">
            <label>Место хранения</label><input type="text" name="location" value="${part?.location || ''}" placeholder="Гараж, бардачок, полка...">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#part-form');
    form.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        const row = [d.operation, d.oem, d.analog, d.price, d.supplier, d.link, d.comment, d.inStock, d.location];
        modal.remove();
        if (isEdit) {
            writeSheet(`PartsCatalog!A${part.id}:I${part.id}`, [row]).then(()=>loadSheet()).catch(e=>console.warn(e));
        } else {
            appendSheet('PartsCatalog!A:I', [row]).then(()=>loadSheet()).catch(e=>console.warn(e));
        }
        showToast(isEdit ? 'Запчасть обновлена' : 'Запчасть добавлена', 'success');
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

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
    form.onsubmit = (e) => { 
        e.preventDefault(); 
        const d = Object.fromEntries(new FormData(form));
        const dateISO = ddmmYYYYtoISO(d.date);
        const mileage = parseFloat(d.mileage);
        const rowIndex = isEdit ? d.rowIndex : null;
        
        const conflict = checkFuelOrderConflicts(dateISO, mileage, rowIndex);
        if (conflict.hasConflict) {
            if (!confirm(conflict.message + '\n\nСохранить, несмотря на нарушение порядка?')) {
                return;
            }
        }
        
        modal.remove();
        const rowData = [dateISO, d.mileage, d.liters, d.pricePerLiter, d.fullTank||'', d.fuelType, d.notes||''];
        (isEdit ? writeSheet(`FuelLog!A${d.rowIndex}:G${d.rowIndex}`, [rowData]) : appendSheet('FuelLog!A:G', [rowData]))
            .then(() => loadSheet())
            .catch(e => console.warn('Ошибка сохранения заправки:', e));
        showToast(isEdit ? 'Заправка обновлена' : 'Заправка добавлена', 'success');
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

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
        showToast(isEdit ? 'Запись о шинах обновлена' : 'Резина добавлена', 'success');
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

// ==================== 11. СОХРАНЕНИЕ ====================
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
    showToast('Операция сохранена', 'success');
}

// ==================== 12. ОФЛАЙН ====================
function addPendingAction(action) { pendingActions.push(action); localStorage.setItem(PENDING_KEY, JSON.stringify(pendingActions)); setSyncStatus('error'); }
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
async function getOrCreatePhotoFolder() {
    const query = encodeURIComponent("name='Vesta_TO_Photos' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const res = await apiCall(`https://www.googleapis.com/drive/v3/files?q=${query}`);
    if (res.files.length) return res.files[0].id;
    const metadata = { name: 'Vesta_TO_Photos', mimeType: 'application/vnd.google-apps.folder' };
    const createRes = await apiCall('https://www.googleapis.com/drive/v3/files', { method:'POST', body:JSON.stringify(metadata) });
    return createRes.id;
}
async function uploadPhoto(file) {
    const metadata = { name: `${new Date().toISOString()}_${file.name}`, mimeType: file.type, parents: [driveFolderId] };
    const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(metadata)], {type:'application/json'})); form.append('file', file);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method:'POST', headers:{Authorization:`Bearer ${accessToken}`}, body:form });
    const data = await res.json(); return `https://drive.google.com/file/d/${data.id}/view`;
}

// ==================== 14. УВЕДОМЛЕНИЯ ====================
async function sendNotification(title, body, tag=null) {
    if (settings.notificationMethod==='telegram'||settings.notificationMethod==='both') await sendTelegramMessage(`${title}\n${body}`);
    if (settings.notificationMethod==='push'||settings.notificationMethod==='both') await sendPushNotification(title, body, tag);
}
async function sendTelegramMessage(text) {
    if (!settings.telegramToken || !settings.telegramChatId) return;
    try { await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ chat_id:settings.telegramChatId, text }) }); } catch(e){}
}
async function sendPushNotification(title, body, tag) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready; await reg.showNotification(title, { body, tag, icon:'icon-192.png' });
}
async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { alert('Push не поддерживается'); return; }
    const perm = await Notification.requestPermission(); if (perm!=='granted') { alert('Нет разрешения'); return; }
    localStorage.setItem('push_subscribed','true'); pushStatus.textContent = '✅ Push активны';
}

// ==================== 15. ГОЛОС ====================
function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { alert('Не поддерживается'); return; }
    const rec = new SR(); rec.lang='ru-RU'; rec.interimResults=false; rec.start();
    rec.onresult = (e) => parseFuelVoice(e.results[0][0].transcript);
    rec.onerror = (e) => alert(e.error==='not-allowed'?'Доступ к микрофону запрещён.':'Ошибка распознавания: '+e.error);
}
function parseFuelVoice(text) {
    const nums = text.match(/\d+(?:[.,]\d+)?/g); if (!nums||nums.length<2) { alert('Скажите пробег и литры'); return; }
    openFuelModal({ mileage:parseInt(nums[0]), liters:parseFloat(nums[1]), pricePerLiter:nums[2]?parseFloat(nums[2]):null });
}

// ==================== 16. СТАТИСТИКА И ФИЛЬТРЫ ====================
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
function filterByPeriod(records, period, dateField='date') {
    if (period === 'all') return records;
    const start = getStartDateForPeriod(period); if (!start) return records;
    return records.filter(r => { const d = r[dateField] ? new Date(r[dateField]) : null; return d && d >= start; });
}
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

function groupFuelByMonth() {
    const sorted = [...fuelLog].filter(r => r.date && r.mileage).sort((a,b) => new Date(a.date) - new Date(b.date));
    const monthlyConsumption = {};
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i-1];
        const curr = sorted[i];
        const mileageDiff = curr.mileage - prev.mileage;
        if (mileageDiff <= 0) continue;
        const consumption = (curr.liters / mileageDiff) * 100;
        const date = new Date(curr.date);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        if (!monthlyConsumption[yearMonth]) monthlyConsumption[yearMonth] = { values: [], totalPrice: 0, count: 0 };
        monthlyConsumption[yearMonth].values.push(consumption);
        monthlyConsumption[yearMonth].totalPrice += curr.liters * curr.pricePerLiter;
        monthlyConsumption[yearMonth].count++;
    }
    const monthlyPrice = {};
    sorted.forEach(r => {
        if (!r.liters || !r.pricePerLiter) return;
        const date = new Date(r.date);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        if (!monthlyPrice[yearMonth]) monthlyPrice[yearMonth] = { totalCost: 0, totalLiters: 0 };
        monthlyPrice[yearMonth].totalCost += r.liters * r.pricePerLiter;
        monthlyPrice[yearMonth].totalLiters += r.liters;
    });
    const allMonths = new Set([...Object.keys(monthlyConsumption), ...Object.keys(monthlyPrice)]);
    const result = [];
    for (const month of allMonths) {
        const consVals = monthlyConsumption[month]?.values || [];
        const avgCons = consVals.length ? consVals.reduce((a,b)=>a+b,0)/consVals.length : null;
        const priceData = monthlyPrice[month];
        const avgPrice = priceData && priceData.totalLiters ? priceData.totalCost / priceData.totalLiters : null;
        result.push({ yearMonth: month, avgConsumption: avgCons, avgPrice: avgPrice });
    }
    return result.sort((a,b) => a.yearMonth.localeCompare(b.yearMonth));
}

function renderFuelConsumptionChart() {
    const canvas = document.getElementById('fuelConsumptionChart');
    if (!canvas) return;
    if (!dataPanel || dataPanel.style.display !== 'block') return;
    const monthly = groupFuelByMonth();
    const labels = monthly.map(m => m.yearMonth);
    const data = monthly.map(m => m.avgConsumption !== null ? m.avgConsumption.toFixed(1) : null);
    const ctx = canvas.getContext('2d');
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    if (data.filter(v => v !== null).length === 0) {
        new Chart(ctx, { type: 'line', data: { labels, datasets: [] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'л/100 км' } } } } });
        return;
    }
    new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Расход (л/100 км)', data, borderColor: '#e67e22', backgroundColor: 'rgba(230,126,34,0.1)', tension: 0.2, fill: true, pointRadius: 4, pointHoverRadius: 6 }] },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw} л/100 км` } },
                legend: { position: 'top' },
                zoom: { pan: { enabled: true, mode: 'x', speed: 10 }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', speed: 0.1, limits: { x: { min: 0.5, max: 5 } } } }
            },
            scales: { y: { title: { display: true, text: 'л/100 км' }, beginAtZero: true } }
        }
    });
    initIcons();
}

function renderFuelPriceChart() {
    const canvas = document.getElementById('fuelPriceChart');
    if (!canvas) return;
    if (!dataPanel || dataPanel.style.display !== 'block') return;
    const monthly = groupFuelByMonth();
    const labels = monthly.map(m => m.yearMonth);
    const data = monthly.map(m => m.avgPrice !== null ? m.avgPrice.toFixed(2) : null);
    const ctx = canvas.getContext('2d');
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    if (data.filter(v => v !== null).length === 0) {
        new Chart(ctx, { type: 'line', data: { labels, datasets: [] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: '₽/л' } } } } });
        return;
    }
    new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Средняя цена (₽/л)', data, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.1)', tension: 0.2, fill: true, pointRadius: 4, pointHoverRadius: 6 }] },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw} ₽/л` } },
                legend: { position: 'top' },
                zoom: { pan: { enabled: true, mode: 'x', speed: 10 }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', speed: 0.1, limits: { x: { min: 0.5, max: 5 } } } }
            },
            scales: { y: { title: { display: true, text: '₽/л' }, beginAtZero: true } }
        }
    });
    initIcons();
}

function groupCostsByMonth(period) {
    const filteredFuel = filterByPeriod(fuelLog, period, 'date');
    const filteredService = filterByPeriod(serviceRecords, period, 'date');
    const fuelByMonth = {};
    const toByMonth = {};
    filteredFuel.forEach(record => {
        if (!record.date || !record.liters || !record.pricePerLiter) return;
        const date = new Date(record.date);
        if (isNaN(date)) return;
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        const cost = record.liters * record.pricePerLiter;
        fuelByMonth[yearMonth] = (fuelByMonth[yearMonth] || 0) + cost;
    });
    filteredService.forEach(record => {
        if (!record.date) return;
        const date = new Date(record.date);
        if (isNaN(date)) return;
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        const parts = Number(record.parts_cost) || 0;
        const work = Number(record.work_cost) || 0;
        toByMonth[yearMonth] = (toByMonth[yearMonth] || 0) + parts + work;
    });
    const allMonths = new Set([...Object.keys(fuelByMonth), ...Object.keys(toByMonth)]);
    const sortedMonths = Array.from(allMonths).sort();
    const months = sortedMonths;
    const fuelCosts = months.map(m => fuelByMonth[m] || 0);
    const toCosts = months.map(m => toByMonth[m] || 0);
    return { months, fuelCosts, toCosts };
}

function renderCostsChart() {
    const canvas = document.getElementById('costsChart');
    if (!canvas) return;
    if (!dataPanel || dataPanel.style.display !== 'block') return;
    const periodSelect = document.getElementById('stats-period-select');
    const period = periodSelect ? periodSelect.value : 'all';
    const { months, fuelCosts, toCosts } = groupCostsByMonth(period);
    const ctx = canvas.getContext('2d');
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    if (months.length === 0) {
        new Chart(ctx, { type: 'bar', data: { labels: [], datasets: [] }, options: { plugins: { legend: { display: true }, tooltip: { callbacks: { title: () => 'Нет данных' } } }, scales: { y: { title: { display: true, text: '₽' } } } } });
        return;
    }
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                { label: 'Топливо (₽)', data: fuelCosts, backgroundColor: 'rgba(52, 152, 219, 0.7)', borderColor: '#2980b9', borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 },
                { label: 'ТО (запчасти + работы) (₽)', data: toCosts, backgroundColor: 'rgba(231, 76, 60, 0.7)', borderColor: '#c0392b', borderWidth: 1, borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.raw.toFixed(2)} ₽` } },
                legend: { position: 'top' },
                zoom: { pan: { enabled: true, mode: 'x', speed: 10 }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', speed: 0.1, limits: { x: { min: 0.5, max: 5 } } } }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Затраты (₽)' }, ticks: { callback: (value) => value.toLocaleString() } },
                x: { title: { display: true, text: 'Месяц' }, ticks: { maxRotation: 45, minRotation: 45 } }
            }
        }
    });
    initIcons();
}

function renderExpensePieChart() {
    const canvas = document.getElementById('expensePieChart');
    if (!canvas) return;
    if (!dataPanel || dataPanel.style.display !== 'block') return;
    const periodSelect = document.getElementById('stats-period-select');
    const period = periodSelect ? periodSelect.value : 'all';
    const filteredFuel = filterByPeriod(fuelLog, period, 'date');
    const fuelCost = filteredFuel.reduce((sum, rec) => sum + (rec.liters * rec.pricePerLiter), 0);
    const filteredService = filterByPeriod(serviceRecords, period, 'date');
    const toCost = filteredService.reduce((sum, rec) => sum + (Number(rec.parts_cost) || 0) + (Number(rec.work_cost) || 0), 0);
    const filteredTires = filterByPeriod(tireLog, period, 'date');
    let tiresCost = 0;
    filteredTires.forEach(t => {
        tiresCost += (t.purchaseCost || 0);
        if (t.mileage !== 0 && t.mountCost) tiresCost += t.mountCost;
    });
    const insuranceCost = filteredService.filter(rec => {
        const op = operations.find(o => o.id == rec.operation_id);
        return op && op.category === 'Документы' && op.name.includes('ОСАГО');
    }).reduce((sum, rec) => sum + (Number(rec.parts_cost) || 0), 0);
    const categories = [];
    const values = [];
    const colors = [];
    if (fuelCost > 0) { categories.push('⛽ Топливо'); values.push(fuelCost); colors.push('#3498db'); }
    if (toCost > 0) { categories.push('🔧 ТО (запчасти+работа)'); values.push(toCost); colors.push('#e74c3c'); }
    if (tiresCost > 0) { categories.push('🛞 Шины'); values.push(tiresCost); colors.push('#2ecc71'); }
    if (insuranceCost > 0) { categories.push('📄 Страховка'); values.push(insuranceCost); colors.push('#f39c12'); }
    const ctx = canvas.getContext('2d');
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
    if (values.length === 0) {
        new Chart(ctx, { type: 'doughnut', data: { labels: ['Нет данных'], datasets: [{ data: [1], backgroundColor: ['#ccc'] }] }, options: { plugins: { legend: { position: 'top' }, tooltip: { callbacks: { title: () => 'Нет данных за период' } } } } });
        return;
    }
    new Chart(ctx, { type: 'doughnut', data: { labels: categories, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 10 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (context) => { const label = context.label || ''; const value = context.raw; const total = context.dataset.data.reduce((a,b) => a + b, 0); const percent = ((value / total) * 100).toFixed(1); return `${label}: ${value.toFixed(2)} ₽ (${percent}%)`; } } } }, cutout: '50%' } });
    initIcons();
}

function updateDrivingModeIndicator() {
    const modeSpan = document.getElementById('driving-mode');
    const hintSpan = document.getElementById('driving-mode-hint');
    if (!modeSpan) return;
    let avgSpeed = null;
    if (settings.currentMotohours > 0 && settings.currentMileage > 0) {
        avgSpeed = settings.currentMileage / settings.currentMotohours;
    } else if (mileageHistory.length >= 2) {
        const first = mileageHistory[0];
        const last = mileageHistory[mileageHistory.length-1];
        const mileageDiff = last.mileage - first.mileage;
        const motoDiff = (last.motohours || 0) - (first.motohours || 0);
        if (motoDiff > 0) avgSpeed = mileageDiff / motoDiff;
    }
    let mode = '—', hint = '', modeClass = '';
    if (avgSpeed !== null) {
        if (avgSpeed < 25) { mode = '🚦 Городской'; hint = 'Интервал масла: 200 м/ч'; modeClass = 'city'; }
        else if (avgSpeed >= 25 && avgSpeed <= 45) { mode = '🚙 Смешанный'; hint = 'Интервал масла: 225 м/ч'; modeClass = 'mixed'; }
        else { mode = '🛣️ Трассовый'; hint = 'Интервал масла: 250 м/ч'; modeClass = 'highway'; }
        modeSpan.textContent = `${mode} (${avgSpeed.toFixed(1)} км/ч)`;
        hintSpan.textContent = hint;
    } else {
        modeSpan.textContent = 'Нет данных';
        hintSpan.textContent = 'Добавьте моточасы';
        modeClass = '';
    }
    const container = document.getElementById('driving-mode-indicator');
    if (container) { container.classList.remove('city', 'highway', 'mixed'); if (modeClass) container.classList.add(modeClass); }
}

function renderFuelAnalytics() {
    if (!dataPanel || dataPanel.style.display !== 'block') return;
    renderFuelConsumptionChart();
    renderFuelPriceChart();
    renderCostsChart();
    renderExpensePieChart();
    updateDrivingModeIndicator();
}

function renderStats() {
    if (!dataPanel || dataPanel.style.display !== 'block') return;
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
    const statsTab = document.getElementById('tab-stats');
    if (statsTab && statsTab.classList.contains('active')) {
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
                    new Chart(ctx, { type: 'doughnut', data: { labels: ['Пройдено', 'Осталось'], datasets: [{ data: [percent, 100 - percent], backgroundColor: ['#2ecc71', '#e0e0e0'] }] }, options: { cutout: '70%', plugins: { legend: { display: false } } } });
                } catch(e) { console.warn('Ошибка графика масла:', e); }
            }
        }
    }
    initIcons();
}

function excelDateToISO(serial) { if (!serial || typeof serial!=='number') return ''; const d = new Date((serial-25569)*86400000); return d.toISOString().split('T')[0]; }

function checkFuelOrderConflicts(dateISO, mileage, excludeRowIndex = null) {
    const sorted = [...fuelLog]
        .filter((_, idx) => idx+2 !== excludeRowIndex)
        .sort((a,b) => {
            if (a.date === b.date) return a.mileage - b.mileage;
            return (a.date || '').localeCompare(b.date || '');
        });
    let prev = null, next = null;
    for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i];
        if (!r.date) continue;
        if (r.date < dateISO) {
            prev = r;
        } else if (r.date === dateISO && r.mileage <= mileage) {
            prev = r;
        } else {
            next = r;
            break;
        }
    }
    let conflict = false;
    let message = '';
    if (prev && prev.mileage > mileage) {
        conflict = true;
        message += `⚠️ Пробег (${mileage} км) меньше предыдущей заправки от ${prev.date} (${prev.mileage} км). `;
    }
    if (next && next.mileage < mileage) {
        conflict = true;
        message += `⚠️ Пробег (${mileage} км) больше следующей заправки от ${next.date} (${next.mileage} км). `;
    }
    if (prev && prev.date > dateISO) {
        conflict = true;
        message += `⚠️ Дата (${dateISO}) раньше предыдущей заправки от ${prev.date}. `;
    }
    if (next && next.date < dateISO) {
        conflict = true;
        message += `⚠️ Дата (${dateISO}) позже следующей заправки от ${next.date}. `;
    }
    return { hasConflict: conflict, message, prevRecord: prev, nextRecord: next };
}

// ==================== 17. ИСТОРИЯ (с фильтрацией) ====================
async function loadHistory() {
    if (!spreadsheetId) return;
    try {
        const raw = await readSheet('История!A2:J'); const validRows=[], hData=[];
        raw.forEach((r,i)=>{ if(r.some(c=>c!==''&&c!=null)){ hData.push(r); validRows.push(i+2); } });
        serviceRecords = hData.map((row, idx) => ({
            rowIndex: validRows[idx],
            operation_id: row[0],
            date: typeof row[1]==='number'?excelDateToISO(row[1]):row[1],
            mileage: row[2],
            motohours: row[3],
            parts_cost: row[4],
            work_cost: row[5],
            is_diy: row[6],
            notes: row[7],
            photo_url: row[8],
            timestamp: row[9]
        }));
        populateHistoryOperationFilter();
        renderHistoryWithFilters();
    } catch(e) { console.warn(e); }
}

function populateHistoryOperationFilter() {
    const select = document.getElementById('history-operation-filter');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">Все операции</option>';
    const uniqueOps = [...new Map(operations.map(op => [op.name, { name: op.name, category: op.category }])).values()];
    uniqueOps.sort((a,b) => a.name.localeCompare(b.name));
    uniqueOps.forEach(op => {
        const option = document.createElement('option');
        option.value = op.name;
        option.textContent = `${op.name} (${op.category})`;
        select.appendChild(option);
    });
    if (currentValue) select.value = currentValue;
}

function getFilteredHistory() {
    const period = document.getElementById('history-period-select')?.value || 'all';
    const opFilter = document.getElementById('history-operation-filter')?.value || '';
    const searchText = (document.getElementById('history-search')?.value || '').toLowerCase();
    const diyOnly = document.getElementById('history-diy-only')?.checked || false;
    const costMin = parseFloat(document.getElementById('history-cost-min')?.value) || 0;
    const costMax = parseFloat(document.getElementById('history-cost-max')?.value) || Infinity;
    
    let filtered = [...serviceRecords];
    
    if (period !== 'all') {
        const startDate = getStartDateForPeriod(period);
        if (startDate) {
            filtered = filtered.filter(r => {
                const d = r.date ? new Date(r.date) : null;
                return d && d >= startDate;
            });
        }
    }
    
    if (opFilter) {
        filtered = filtered.filter(r => {
            const op = operations.find(o => o.id == r.operation_id);
            return op && op.name === opFilter;
        });
    }
    
    if (searchText) {
        filtered = filtered.filter(r => {
            const op = operations.find(o => o.id == r.operation_id);
            const opName = op ? op.name.toLowerCase() : '';
            const notes = (r.notes || '').toLowerCase();
            return opName.includes(searchText) || notes.includes(searchText);
        });
    }
    
    if (diyOnly) {
        filtered = filtered.filter(r => r.is_diy === true || r.is_diy === 'TRUE');
    }
    
    filtered = filtered.filter(r => {
        const cost = (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
        return cost >= costMin && cost <= costMax;
    });
    
    return filtered;
}

function renderHistoryWithFilters() {
    const tbody = historyBody;
    if (!tbody) return;
    const filtered = getFilteredHistory();
    tbody.innerHTML = '';
    filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(record => {
        const tr = document.createElement('tr');
        const op = operations.find(o => o.id == record.operation_id) || { name: 'Неизвестно' };
        const diyFlag = record.is_diy === 'TRUE' || record.is_diy === true;
        tr.innerHTML = `
            <td>${record.date || ''}</td>
            <td>${op.name}</td>
            <td>${record.mileage || ''}</td>
            <td>${record.motohours || ''}</td>
            <td>${record.parts_cost || ''}</td>
            <td>${record.work_cost || ''}</td>
            <td>${record.notes || ''}</td>
            <td style="text-align:center;">${diyFlag ? '<i data-lucide="check"></i>' : '—'}</td>
            <td>
                <button class="icon-btn edit-history-btn" data-row="${record.rowIndex}" data-opid="${record.operation_id}" data-date="${record.date}" data-mileage="${record.mileage}" data-motohours="${record.motohours}" data-parts="${record.parts_cost}" data-work="${record.work_cost}" data-diy="${record.is_diy}" data-notes="${record.notes}" data-photo="${record.photo_url}"><i data-lucide="pencil"></i></button>
                <button class="icon-btn delete-history-btn" data-row="${record.rowIndex}"><i data-lucide="trash-2"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    document.querySelectorAll('.edit-history-btn').forEach(b => b.addEventListener('click', openHistoryEdit));
    document.querySelectorAll('.delete-history-btn').forEach(b => b.addEventListener('click', deleteHistoryEntry));
    initIcons();
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
        showToast('Запись истории обновлена', 'success');
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

async function deleteHistoryEntry(e) {
    const btn = e.currentTarget;
    const rowIndex = btn.dataset.row;
    if (!confirm('Удалить запись из истории? Это действие нельзя отменить.')) return;
    await writeSheet(`История!A${rowIndex}:J${rowIndex}`, [['','','','','','','','','','']]);
    loadHistory();
    showToast('Запись удалена', 'success');
}

// ==================== 18. ОБРАБОТЧИКИ ====================
function attachTOListeners() {
    document.querySelectorAll('.add-record-btn').forEach(b=>b.addEventListener('click',e=>openServiceModal(b.dataset.opId,b.dataset.opName)));
    document.querySelectorAll('.edit-op-btn').forEach(b=>b.addEventListener('click',e=>openOperationForm(operations.find(o=>o.id==b.dataset.opId))));
    document.querySelectorAll('.calendar-btn').forEach(b=>b.addEventListener('click',e=>addToCalendar(b.dataset.opName,b.dataset.planDate,b.dataset.planMileage)));
    document.querySelectorAll('.shopping-list-btn').forEach(b=>b.addEventListener('click',e=>generateShoppingList(b.dataset.opId)));
}
function attachPartsListeners() {
    document.querySelectorAll('.edit-part-btn').forEach(b=>b.addEventListener('click',e=>{ const p=parts.find(x=>x.id==b.dataset.id); openPartForm(p); }));
    document.querySelectorAll('.delete-part-btn').forEach(b=>b.addEventListener('click',async e=>{ if(confirm('Удалить?')){ await writeSheet(`PartsCatalog!A${b.dataset.id}:I${b.dataset.id}`,[['','','','','','','','','']]); await loadSheet(); } }));
    document.querySelectorAll('.search-part-btn').forEach(b=>b.addEventListener('click',e=>{ if(b.dataset.oem) showCatalogMenu(b,b.dataset.oem); }));
}
function attachFuelListeners() {
    document.querySelectorAll('.delete-fuel-btn').forEach(b=>b.addEventListener('click',async e=>{ if(!confirm('Удалить?')) return; const i=b.dataset.index; await writeSheet(`FuelLog!A${+i+2}:G${+i+2}`,[['','','','','','','']]); await loadSheet(); }));
    document.querySelectorAll('.edit-fuel-btn').forEach(b=>b.addEventListener('click',e=>{ const rec=fuelLog[b.dataset.index]; if(rec){ rec.rowIndex=+b.dataset.index+2; openFuelModal(rec); } }));
}
function attachTireListeners() {
    document.querySelectorAll('.edit-tire-btn').forEach(b=>b.addEventListener('click',e=>{ const rec=tireLog[b.dataset.index]; if(rec){ rec.rowIndex=+b.dataset.index+2; openTireModal(rec); } }));
    document.querySelectorAll('.delete-tire-btn').forEach(b=>b.addEventListener('click',async e=>{ if(!confirm('Удалить?')) return; const i=b.dataset.index; await writeSheet(`Tires!A${+i+2}:J${+i+2}`,[['','','','','','','','','','']]); await loadSheet(); }));
}

function showCatalogMenu(button, oem) {
    const existingMenu = document.querySelector('.catalog-popup-menu');
    if (existingMenu) existingMenu.remove();
    const rect = button.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'catalog-popup-menu';
    menu.style.position = 'fixed';
    menu.style.background = 'var(--card-bg)';
    menu.style.border = '1px solid var(--border)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '8px 0';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '150px';
    menu.style.visibility = 'hidden';
    const catalogs = [
        { name: 'Exist', value: 'exist' },
        { name: 'Drive2', value: 'drive2' },
        { name: 'CrossData', value: 'crossdata' },
        { name: 'ZZap', value: 'zzap' }
    ];
    catalogs.forEach(cat => {
        const item = document.createElement('div');
        item.textContent = cat.name;
        item.style.padding = '8px 16px';
        item.style.cursor = 'pointer';
        item.style.whiteSpace = 'nowrap';
        item.style.color = 'var(--text)';
        item.addEventListener('mouseenter', () => item.style.background = 'var(--bg)');
        item.addEventListener('mouseleave', () => item.style.background = 'transparent');
        item.addEventListener('click', () => {
            let url;
            switch (cat.value) {
                case 'drive2': url = `https://www.drive2.ru/search?text=${encodeURIComponent(oem)}`; break;
                case 'crossdata': url = `https://crossdata.pro`; break;
                case 'zzap': url = `https://www.zzap.ru`; break;
                default: url = `https://exist.ru/price/?pcode=${encodeURIComponent(oem)}`;
            }
            window.open(url, '_blank');
            menu.remove();
        });
        menu.appendChild(item);
    });
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let top = rect.bottom + 5;
    let left = rect.left;
    if (left + menuRect.width > viewportWidth - 10) left = viewportWidth - menuRect.width - 10;
    if (left < 10) left = 10;
    if (top + menuRect.height > viewportHeight - 10) top = rect.top - menuRect.height - 5;
    if (top < 10) top = Math.max(10, (viewportHeight - menuRect.height) / 2);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    menu.style.visibility = 'visible';
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
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
    await writeSheet('Журнал ТО!Q1:Q12', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours],[],[],[settings.telegramToken],[settings.telegramChatId],[baseMileage],[baseMotohours],[purchaseDate],[]]);
    document.getElementById('settings-result').textContent = '✅ Сохранено';
    showToast('Настройки сохранены', 'success');
}

function exportData() {
    const data = { operations, settings, parts, fuelLog, tireLog, workCosts };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vesta_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Экспорт JSON выполнен', 'success');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            operations = d.operations; settings = d.settings; parts = d.parts || [];
            fuelLog = d.fuelLog || []; tireLog = d.tireLog || []; workCosts = d.workCosts || [];
            renderAll();
            if (isOnline) await syncAllToSheet();
            showToast('Импорт выполнен', 'success');
        } catch (err) { showToast('Ошибка импорта', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

async function syncAllToSheet() {
    const opsRows = operations.map(o => [o.category, o.name, o.lastDate||'', o.lastMileage||'', o.lastMotohours||'', o.intervalKm, o.intervalMonths, o.intervalMotohours||'']);
    await writeSheet('Журнал ТО!A2:H', opsRows);
    await writeSheet('Журнал ТО!Q1:Q12', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours],[],[],[settings.telegramToken],[settings.telegramChatId],[baseMileage],[baseMotohours],[purchaseDate],[]]);
}

function generateShoppingList(opId) {
    const op = operations.find(o => o.id == opId);
    if (!op) return;
    const items = parts.filter(p => p.operation === op.name || p.operation === op.category);
    if (!items.length) { alert('Нет запчастей для этой операции'); return; }
    let list = `🛒 ${op.name}:\n`;
    items.forEach(p => {
        const stock = p.inStock || 0;
        const location = p.location ? ` (${p.location})` : '';
        if (stock > 0) {
            list += `- ${p.oem || p.analog} ${p.price ? p.price+'₽' : ''} — ✅ есть на складе: ${stock} шт.${location}\n`;
        } else {
            list += `- ${p.oem || p.analog} ${p.price ? p.price+'₽' : ''} — ❌ нужно купить\n`;
        }
    });
    alert(list);
}

// ==================== 19. ТЕМА (СОХРАНЕНИЕ) ====================
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    } else {
        document.body.classList.remove('dark');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="moon"></i>';
    }
    localStorage.setItem('vesta_theme', theme);
    initIcons();
}

function loadTheme() {
    const savedTheme = localStorage.getItem('vesta_theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    }
}

// ==================== 20. ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ====================
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
    themeToggle.onclick = () => {
        const isDark = document.body.classList.contains('dark');
        applyTheme(isDark ? 'light' : 'dark');
    };
    const selectCarBtn = document.getElementById('select-car-btn'); if(selectCarBtn) selectCarBtn.addEventListener('click', openCarSelectModal);
    document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        btn.classList.add('active'); document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        if(btn.dataset.tab==='history') loadHistory();
        if(btn.dataset.tab==='stats') { renderStats(); renderFuelAnalytics(); }
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
    if(periodSelect) { periodSelect.value = localStorage.getItem('stats_period')||'all'; periodSelect.addEventListener('change', ()=>{ localStorage.setItem('stats_period', periodSelect.value); if(document.getElementById('tab-stats').classList.contains('active')) { renderStats(); renderFuelAnalytics(); } }); }
    if(toggleOwnershipUnitBtn) toggleOwnershipUnitBtn.addEventListener('click', ()=>{ ownershipDisplayMode = ownershipDisplayMode==='days'?'years':'days'; updateOwnershipDisplay(); });
    
    const resetZoomBtn = document.getElementById('reset-all-zoom');
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', () => {
            const chartIds = ['fuelConsumptionChart', 'fuelPriceChart', 'costsChart'];
            chartIds.forEach(id => {
                const chart = Chart.getChart(id);
                if (chart && typeof chart.resetZoom === 'function') {
                    chart.resetZoom();
                }
            });
            console.log('Масштаб графиков сброшен');
        });
    }

    // Фильтры истории
    const historyPeriod = document.getElementById('history-period-select');
    const historyOpFilter = document.getElementById('history-operation-filter');
    const historySearch = document.getElementById('history-search');
    const historyDiyOnly = document.getElementById('history-diy-only');
    const historyCostMin = document.getElementById('history-cost-min');
    const historyCostMax = document.getElementById('history-cost-max');
    const historyResetBtn = document.getElementById('history-reset-filters');

    const applyHistoryFilters = () => renderHistoryWithFilters();

    if (historyPeriod) historyPeriod.addEventListener('change', applyHistoryFilters);
    if (historyOpFilter) historyOpFilter.addEventListener('change', applyHistoryFilters);
    if (historySearch) historySearch.addEventListener('input', applyHistoryFilters);
    if (historyDiyOnly) historyDiyOnly.addEventListener('change', applyHistoryFilters);
    if (historyCostMin) historyCostMin.addEventListener('input', applyHistoryFilters);
    if (historyCostMax) historyCostMax.addEventListener('input', applyHistoryFilters);
    if (historyResetBtn) {
        historyResetBtn.addEventListener('click', () => {
            if (historyPeriod) historyPeriod.value = 'all';
            if (historyOpFilter) historyOpFilter.value = '';
            if (historySearch) historySearch.value = '';
            if (historyDiyOnly) historyDiyOnly.checked = false;
            if (historyCostMin) historyCostMin.value = '';
            if (historyCostMax) historyCostMax.value = '';
            applyHistoryFilters();
        });
    }
    
    // Экспорт CSV (настройки)
    const csvExportBtn = document.getElementById('export-data-btn');
    if (csvExportBtn) {
        csvExportBtn.addEventListener('click', handleExport);
    }
}

// ==================== 21. ЭКСПОРТ CSV (универсальный) ====================
function exportToCSV(data, filename, headers) {
    if (!data || data.length === 0) {
        showToast('Нет данных для экспорта', 'warning');
        return;
    }
    let csvRows = [];
    if (headers) csvRows.push(headers.join(';'));
    for (const row of data) {
        const values = row.map(cell => {
            const cellStr = String(cell ?? '').replace(/"/g, '""');
            if (cellStr.includes(';') || cellStr.includes('\n') || cellStr.includes('"')) return `"${cellStr}"`;
            return cellStr;
        });
        csvRows.push(values.join(';'));
    }
    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Экспорт CSV выполнен', 'success');
}

function getExportData(type) {
    switch (type) {
        case 'to':
            return {
                data: operations.map(op => [op.category, op.name, op.lastDate||'', op.lastMileage||'', op.lastMotohours||'', op.intervalKm, op.intervalMonths, op.intervalMotohours??'']),
                headers: ['Категория', 'Операция', 'Последняя дата', 'Последний пробег', 'Последние моточасы', 'Интервал км', 'Интервал мес', 'Интервал м/ч'],
                filename: 'vesta_operations'
            };
        case 'fuel':
            return {
                data: fuelLog.map(f => [f.date, f.mileage, f.liters, f.pricePerLiter, (f.fullTank==='TRUE'||f.fullTank===true)?'Да':'Нет', f.fuelType, f.notes||'']),
                headers: ['Дата', 'Пробег', 'Литры', 'Цена/л', 'Полный бак', 'Тип топлива', 'Примечание'],
                filename: 'vesta_fuel'
            };
        case 'tires':
            return {
                data: tireLog.map(t => [t.date, t.type, t.mileage, t.model||'', t.size||'', t.wear||'', t.notes||'', t.purchaseCost||'', t.mountCost||'', t.isDIY?'Да':'Нет']),
                headers: ['Дата', 'Тип', 'Пробег', 'Модель', 'Размер', 'Износ', 'Примечание', 'Стоимость покупки', 'Стоимость монтажа', 'DIY'],
                filename: 'vesta_tires'
            };
        case 'parts':
            return {
                data: parts.map(p => [p.operation, p.oem, p.analog, p.price, p.supplier, p.link, p.comment, p.inStock||0, p.location||'']),
                headers: ['Операция', 'OEM', 'Аналог', 'Цена', 'Поставщик', 'Ссылка', 'Комментарий', 'В наличии (шт.)', 'Место хранения'],
                filename: 'vesta_parts'
            };
        case 'history':
            const filtered = getFilteredHistory();
            return {
                data: filtered.map(record => {
                    const op = operations.find(o=>o.id==record.operation_id);
                    const opName = op ? op.name : 'Неизвестно';
                    return [record.date||'', opName, record.mileage||'', record.motohours||'', record.parts_cost||'', record.work_cost||'', record.notes||'', (record.is_diy==='TRUE'||record.is_diy===true)?'Да':'Нет'];
                }),
                headers: ['Дата', 'Операция', 'Пробег', 'Моточасы', 'Запчасти (₽)', 'Работа (₽)', 'Примечание', 'DIY'],
                filename: 'vesta_history'
            };
        case 'all':
            showToast('Функция "Все данные" скачает несколько файлов по очереди.', 'info');
            const types = ['to', 'fuel', 'tires', 'parts', 'history'];
            for (const t of types) {
                const { data, headers, filename } = getExportData(t);
                if (data && data.length) exportToCSV(data, filename, headers);
            }
            return null;
        default: return null;
    }
}

function handleExport() {
    const select = document.getElementById('export-type-select');
    const type = select.value;
    const exportData = getExportData(type);
    if (exportData && exportData.data) exportToCSV(exportData.data, exportData.filename, exportData.headers);
}

// ==================== 22. ОБНОВЛЕНИЕ ПРОБЕГА И ВЛАДЕНИЕ ====================
async function updateMileageAndAverages() {
    const m = document.getElementById('new-mileage'), h = document.getElementById('new-motohours');
    if (!m||!h){ alert('Поля не найдены'); return; }
    const newM = parseFloat(m.value), newH = parseFloat(h.value);
    if (isNaN(newM)||isNaN(newH)){ alert('Введите числа'); return; }
    const today = new Date().toISOString().split('T')[0];
    await appendSheet('MileageLog!A:C', [[today, newM, newH]]);
    mileageHistory.push({ date:today, mileage:newM, motohours:newH });
    mileageHistory.sort((a,b)=>new Date(a.date)-new Date(b.date));
    if (mileageHistory.length>=2){
        const l=mileageHistory.at(-1), p=mileageHistory.at(-2);
        const days=(new Date(l.date)-new Date(p.date))/86400000;
        if (days>0){
            settings.avgDailyMileage=(l.mileage-p.mileage)/days;
            settings.avgDailyMotohours=(l.motohours-p.motohours)/days;
        }
    } else {
        settings.avgDailyMileage=baseMileage>0?(newM-baseMileage)/30:20;
        settings.avgDailyMotohours=baseMotohours>0?(newH-baseMotohours)/30:1.65;
    }
    settings.currentMileage=newM; settings.currentMotohours=newH;
    await writeSheet('Журнал ТО!Q1:Q4', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours]]);
    renderAll(); renderTop5Widget();
    showToast('Пробег и моточасы обновлены', 'success');
}

function updateOwnershipDisplay() {
    if (!ownershipDisplay||!ownershipUnit) return;
    ownershipDisplay.textContent = ownershipDisplayMode==='days' ? ownershipDays : (ownershipDays/365.25).toFixed(1);
    ownershipUnit.textContent = ownershipDisplayMode==='days' ? 'дней' : 'лет';
}

function calculateOwnershipDays() {
    const inp = document.getElementById('ownership-days');
    if (!purchaseDate){
        ownershipDays=0;
        if (inp) inp.value='';
        updateOwnershipDisplay();
        return;
    }
    const d=new Date(), p=new Date(purchaseDate);
    ownershipDays=Math.floor(Math.abs(d-p)/86400000);
    if (inp) inp.value=ownershipDays;
    updateOwnershipDisplay();
}

// ==================== 23. ВИДЖЕТ ТОП-5 ====================
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
        let isMainOfPair = false, pair = null;
        for (const p of LINKED_PAIRS) { if (op.name === p.main) { isMainOfPair = true; pair = p; break; } }
        if (isMainOfPair) {
            const linkedOp = candidates.find(o => o.name === pair.linked && !usedIds.has(o.id));
            if (linkedOp) {
                const mainPlan = calculatePlan(op);
                const linkedPlan = calculatePlan(linkedOp);
                const primaryPlan = mainPlan.daysLeft <= linkedPlan.daysLeft ? mainPlan : linkedPlan;
                const primaryOp = mainPlan.daysLeft <= linkedPlan.daysLeft ? op : linkedOp;
                groupedOps.push({ name: pair.combinedName, op: primaryOp, plan: primaryPlan, isGroup: true });
                usedIds.add(op.id); usedIds.add(linkedOp.id);
                continue;
            }
        }
        let isLinkedInPair = false;
        for (const p of LINKED_PAIRS) { if (op.name === p.linked) { isLinkedInPair = true; break; } }
        if (isLinkedInPair) { const mainOp = candidates.find(o => o.name === LINKED_PAIRS.find(p => p.linked === op.name)?.main); if (mainOp && !usedIds.has(mainOp.id)) continue; }
        if (!usedIds.has(op.id)) { groupedOps.push({ name: op.name, op: op, plan: calculatePlan(op), isGroup: false }); usedIds.add(op.id); }
    }
    const sorted = groupedOps.sort((a, b) => a.plan.daysLeft - b.plan.daysLeft);
    const top5 = sorted.slice(0, 5);
    let html = '';
    top5.forEach(item => {
        const op = item.op, plan = item.plan;
        let motoFresh = true;
        if (op.name.includes('Масло') && op.category.includes('ДВС') && mileageHistory.length >= 1) {
            const lastEntry = mileageHistory[mileageHistory.length-1];
            if ((settings.currentMotohours - lastEntry.motohours) > 20 || (settings.currentMileage - lastEntry.mileage) > 500) motoFresh = false;
        }
        let percent = 0;
        if (op.intervalKm && plan.planMileage > (op.lastMileage || 0)) percent = Math.min(100, Math.round((settings.currentMileage - (op.lastMileage || 0)) / (plan.planMileage - (op.lastMileage || 0)) * 100));
        else if (op.intervalMotohours && motoFresh && plan.recMotohours > (op.lastMotohours || 0)) percent = Math.min(100, Math.round((settings.currentMotohours - (op.lastMotohours || 0)) / (plan.recMotohours - (op.lastMotohours || 0)) * 100));
        else if (op.intervalMonths) { const lastDate = op.lastDate ? new Date(op.lastDate) : new Date(); const totalDays = op.intervalMonths * 30; const elapsed = Math.floor((new Date() - lastDate) / 86400000); percent = Math.min(100, Math.round((elapsed / totalDays) * 100)); }
        if (percent < 0) percent = 0;
        const daysLeft = plan.daysLeft, mileageLeft = plan.planMileage - settings.currentMileage, motoLeft = plan.recMotohours ? (plan.recMotohours - settings.currentMotohours) : null;
        let statusText = daysLeft < 0 ? `⚠️ просрочено на ${Math.abs(daysLeft)} дн.` : `осталось ${daysLeft} дн.`;
        if (mileageLeft > 0 && op.intervalKm) statusText += ` / ${mileageLeft} км`;
        else if (motoLeft > 0 && op.intervalMotohours && motoFresh) statusText += ` / ${motoLeft.toFixed(0)} м/ч`;
        html += `<div class="top5-item"><div class="top5-header"><span class="top5-name">${item.name}</span><span class="top5-stats">${statusText}</span></div><div class="top5-progress-container"><div class="top5-progress-bar" style="width: ${percent}%;"></div></div></div>`;
    });
    container.innerHTML = html;
    initIcons();
}

// ==================== 24. ЗАПУСК ====================
pendingActions = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
settings.notificationMethod = localStorage.getItem('notificationMethod') || 'telegram';
loadTheme();
initGoogleApi();
initEventListeners();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
