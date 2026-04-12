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
// ==================== 4. АВТОРИЗАЦИЯ ====================
function startAuth() {
    const redirectUri = window.location.origin + window.location.pathname;
    const cleanRedirectUri = redirectUri.replace(/\/$/, '');
    const scope = SCOPES;
    const authUrl = `${AUTH_URL}?` +
        `client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(cleanRedirectUri)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(scope)}` +
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
        return;
    }
    authPanel.style.display = 'block';
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
        const [opsData, settingsData, partsData, fuelData, tiresData, workCostsData] = await Promise.all([
            readSheet('Журнал ТО!A2:H'),
            readSheet('Журнал ТО!Q1:Q8'),
            readSheet('PartsCatalog!A2:G').catch(() => []),
            readSheet('FuelLog!A2:F').catch(() => []),
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

        fuelLog = fuelData.map(r => ({ date: r[0], mileage: +r[1], liters: +r[2], pricePerLiter: +r[3], fullTank: r[4], notes: r[5] }));
        tireLog = tiresData.map(r => ({ date: r[0], type: r[1], mileage: +r[2], notes: r[3] }));
        workCosts = workCostsData.map(r => ({ operationId: +r[0], cost: +r[1], isDIY: r[2] === 'TRUE', notes: r[3] }));

        localStorage.setItem(CACHE_KEY, JSON.stringify({ operations, settings, parts, fuelLog, tireLog, workCosts }));
        renderAll();loadHistory();
        dataPanel.style.display = 'block';
        setSyncStatus('synced');
        sheetStatus.textContent = '✅ Данные загружены';
        syncPendingActions();
        driveFolderId = await getOrCreatePhotoFolder();
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
    let recDate = op.lastDate ? new Date(op.lastDate) : new Date(today);
    recDate.setMonth(recDate.getMonth() + op.intervalMonths);
    const recMileage = op.lastMileage ? op.lastMileage + op.intervalKm : op.intervalKm;
    const avgSpeed = settings.avgDailyMileage / settings.avgDailyMotohours;
    const motoInterval = getOilMotohoursInterval(op, avgSpeed);
    let recMotohours = motoInterval ? (op.lastMotohours ? op.lastMotohours + motoInterval : settings.currentMotohours + motoInterval) : null;

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
    // Берём самую раннюю из трёх дат
    const planDate = new Date(Math.min(recDate, dateByMileage, dateByMoto));
    const daysLeft = Math.ceil((planDate - today) / 86400000);
    return {
        recDate: recDate.toISOString().split('T')[0],
        recMileage,
        recMotohours: recMotohours || '',
        planDate: planDate.toISOString().split('T')[0],
        planMileage: recMileage,
        daysLeft
    };
}
// ==================== 9. ОТРИСОВКА ====================
function renderAll() {
    document.getElementById('display-mileage').textContent = settings.currentMileage;
    document.getElementById('display-motohours').textContent = settings.currentMotohours;
    document.getElementById('display-avg-mileage').textContent = settings.avgDailyMileage;
    renderTOTable(); renderPartsTable(); renderFuelTable(); renderTiresTable(); updateNextServiceWidget(); renderStats();loadHistory();
    document.getElementById('set-mileage').value = settings.currentMileage;
    document.getElementById('set-motohours').value = settings.currentMotohours;
    document.getElementById('set-avg-mileage').value = settings.avgDailyMileage;
    document.getElementById('set-avg-motohours').value = settings.avgDailyMotohours;
    document.getElementById('telegram-token').value = settings.telegramToken || '';
    document.getElementById('telegram-chatid').value = settings.telegramChatId || '';
    document.getElementById('notification-method').value = settings.notificationMethod || 'telegram';
}

function renderTOTable() {
    const tbody = document.getElementById('table-body'); tbody.innerHTML = '';
    const sorted = [...operations].sort((a,b) => calculatePlan(a).daysLeft - calculatePlan(b).daysLeft);
    sorted.forEach(op => {
        const plan = calculatePlan(op);
        let cls = ''; if (plan.daysLeft < 0) cls = 'overdue'; else if (plan.daysLeft <= 10) cls = 'critical'; else if (plan.daysLeft <= 20) cls = 'warning'; else if (plan.daysLeft <= 30) cls = 'attention';
        const tr = document.createElement('tr'); tr.className = cls; tr.dataset.rowIndex = op.rowIndex; tr.dataset.operationId = op.id;
        tr.innerHTML = `<td><strong>${op.name}</strong><br><small>${op.category}</small></td><td>${op.lastDate ? new Date(op.lastDate).toLocaleDateString('ru-RU') : '—'}</td><td>${op.lastMileage||'—'}</td><td>${op.lastMotohours||'—'}</td><td><strong>${plan.planDate.split('-').reverse().join('.')}</strong><br><small>${plan.planMileage} км</small></td><td>${plan.daysLeft < 0 ? `⚠️ ${Math.abs(plan.daysLeft)} дн.` : `${plan.daysLeft} дн.`}</td>
            <td><button class="icon-btn add-record-btn" data-op-id="${op.id}" data-op-name="${op.name}">➕</button> <button class="icon-btn edit-op-btn" data-op-id="${op.id}">✏️</button> <button class="icon-btn calendar-btn" data-op-name="${op.name}" data-plan-date="${plan.planDate}" data-plan-mileage="${plan.planMileage}">📅</button> <button class="icon-btn shopping-list-btn" data-op-id="${op.id}">🛒</button></td>`;
        tbody.appendChild(tr);
    });
    attachTOListeners();
}

function renderPartsTable() {
    const tbody = document.getElementById('parts-body'); tbody.innerHTML = '';
    parts.forEach(p => {
        const tr = document.createElement('tr'); tr.dataset.id = p.id;
        tr.innerHTML = `<td>${p.operation}</td><td>${p.oem}</td><td>${p.analog}</td><td>${p.price ? p.price+' ₽' : ''}</td><td>${p.supplier}</td><td>${p.link ? `<a href="${p.link}" target="_blank">🔗</a>` : ''}</td><td>${p.comment}</td>
            <td><button class="icon-btn edit-part-btn" data-id="${p.id}">✏️</button> <button class="icon-btn delete-part-btn" data-id="${p.id}">🗑️</button> <button class="icon-btn search-part-btn" data-oem="${p.oem}">🔍</button></td>`;
        tbody.appendChild(tr);
    });
}

function renderFuelTable() {
    const tbody = document.getElementById('fuel-body'); tbody.innerHTML = '';
    fuelLog.forEach((f,i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${f.date}</td><td>${f.mileage}</td><td>${f.liters}</td><td>${f.pricePerLiter}</td><td>${f.fullTank||''}</td><td>${f.notes||''}</td><td><button class="icon-btn delete-fuel-btn" data-index="${i}">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

function renderTiresTable() {
    const tbody = document.getElementById('tires-body'); tbody.innerHTML = '';
    tireLog.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${t.date}</td><td>${t.type}</td><td>${t.mileage}</td><td>${t.notes||''}</td>`;
        tbody.appendChild(tr);
    });
}

function updateNextServiceWidget() {
    if (!operations.length) return;
    const validOps = operations.filter(op => {
        const plan = calculatePlan(op);
        return isFinite(plan.daysLeft) && plan.planDate && plan.daysLeft !== null;
    });
    if (!validOps.length) return;
    const sorted = [...validOps].sort((a,b) => calculatePlan(a).daysLeft - calculatePlan(b).daysLeft);
    const next = sorted[0];
    const plan = calculatePlan(next);
    document.getElementById('next-service-name').textContent = `${next.name} (${next.category})`;
    const percent = Math.min(100, Math.round((settings.currentMileage - next.lastMileage) / (plan.planMileage - next.lastMileage) * 100));
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('progress-details').textContent = `Пробег: ${settings.currentMileage} / ${plan.planMileage} км | Осталось: ${plan.daysLeft} дн.`;
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

function openServiceModal(opId, opName) {
    const op = operations.find(o => o.id == opId);
    const isOsago = (op && op.category === 'Документы' && op.name.includes('ОСАГО'));

    const modal = createModal('➕ Выполнить ТО', `
        <form id="service-form" enctype="multipart/form-data">
            <input type="hidden" name="opId" value="${opId}"><p><strong>${opName}</strong></p>
            <label>Дата (ДД.ММ.ГГГГ)</label>
            <input type="text" name="date" placeholder="дд.мм.гггг" pattern="\\d{2}\\.\\d{2}\\.\\d{4}" required>
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
    form.onsubmit = async (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const photo = data.get('photo');
        let photoUrl = '';
        if (photo && photo.size > 0) photoUrl = await uploadPhoto(photo);
        const cost = data.get('cost') || '0';
        const workCost = data.get('workCost') || '0';
        const isDIY = data.get('isDIY') === 'true';
        const notes = data.get('notes') || '';
        const fileLink = data.get('fileLink') || '';
        const osagoMonths = data.get('osagoMonths') || '12';
        const motohours = parseFloat(data.get('motohours')) || 0;
        let rawDate = data.get('date');
        let formattedDate = rawDate;
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(rawDate)) {
            const parts = rawDate.split('.');
            formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        let fullNotes = notes;
        if (isOsago) {
            fullNotes = `ОСАГО. Стоимость: ${cost} ₽. Срок: ${osagoMonths} мес. Ссылка: ${fileLink}. ` + notes;
        }

        await addServiceRecord(data.get('opId'), formattedDate, data.get('mileage'), motohours, cost, workCost, isDIY, fullNotes, photoUrl);
        modal.remove();
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

function openOperationForm(op = null) {
    const modal = createModal(op ? '✏️ Редактировать' : '➕ Новая операция', `
        <form id="op-form"><input type="hidden" name="id" value="${op?.id||''}"><input type="hidden" name="rowIndex" value="${op?.rowIndex||''}">
            <label>Категория</label><input type="text" name="category" value="${op?.category||''}" required>
            <label>Название</label><input type="text" name="name" value="${op?.name||''}" required>
            <label>Интервал, км</label><input type="number" name="km" value="${op?.intervalKm||''}" required>
            <label>Интервал, мес</label><input type="number" name="months" value="${op?.intervalMonths||''}" required>
            <label>Интервал, моточасов</label><input type="number" name="moto" value="${op?.intervalMotohours||''}">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#op-form');
    form.onsubmit = async (e) => { e.preventDefault(); await saveOperation(Object.fromEntries(new FormData(form))); modal.remove(); };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}
// ==================== 11. СОХРАНЕНИЕ ====================
async function addServiceRecord(opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl) {
    const op = operations.find(o => o.id == opId);
    if (!op) return;
    const values = [[date, mileage, motohours || '']];
    if (isOnline) {
        await writeSheet(`Журнал ТО!C${op.rowIndex}:E${op.rowIndex}`, values);
        await appendSheet('История!A:J', [[opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl, new Date().toISOString()]]);
        await appendSheet('WorkCosts!A:D', [[opId, workCost, isDIY, notes]]);
        sendNotification('✅ Выполнено ТО', `${op.name}\nПробег: ${mileage} км\nЗатраты: ${+partsCost + +workCost} ₽`);
        await loadSheet();
    } else {
        addPendingAction({ type: 'service', opId, date, mileage, motohours, partsCost, workCost, isDIY, notes, photoUrl, rowIndex: op.rowIndex });
        op.lastDate = date; op.lastMileage = +mileage; op.lastMotohours = +motohours;
        renderTOTable(); updateNextServiceWidget();
        localStorage.setItem(CACHE_KEY, JSON.stringify({ operations, settings, parts, fuelLog, tireLog, workCosts }));
    }
}

async function saveOperation(data) {
    const rowData = [data.category, data.name, '', '', '', data.km, data.months, data.moto || ''];
    if (data.id && data.rowIndex) {
        await writeSheet(`Журнал ТО!A${data.rowIndex}:H${data.rowIndex}`, [rowData]);
    } else {
        await appendSheet('Журнал ТО!A:H', [rowData]);
    }
    await loadSheet();
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
                await appendSheet('История!A:J', [[action.opId, action.date, action.mileage, action.motohours, action.partsCost, action.workCost, action.isDIY, action.notes, action.photoUrl, new Date().toISOString()]]);
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
    await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: settings.telegramChatId, text: text })
    });
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
    document.getElementById('push-status').textContent = '✅ Push активны';
}
// ==================== 15. ГОЛОС ====================
function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Не поддерживается'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU'; recognition.interimResults = false;
    recognition.start();
    recognition.onresult = (e) => parseFuelVoice(e.results[0][0].transcript);
    recognition.onerror = (e) => alert('Ошибка: ' + e.error);
}

function parseFuelVoice(text) {
    const numbers = text.match(/\d+(?:[.,]\d+)?/g);
    if (!numbers || numbers.length < 2) { alert('Скажите пробег и литры'); return; }
    openFuelModal({ mileage: parseInt(numbers[0]), liters: parseFloat(numbers[1]), pricePerLiter: numbers[2] ? parseFloat(numbers[2]) : null });
}

function openFuelModal(prefill = {}) {
    const modal = createModal('⛽ Заправка', `
        <form id="fuel-form"><label>Дата</label><input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" required>
            <label>Пробег</label><input type="number" name="mileage" value="${prefill.mileage || settings.currentMileage}" required>
            <label>Литры</label><input type="number" name="liters" step="0.01" value="${prefill.liters || ''}" required>
            <label>Цена/л</label><input type="number" name="pricePerLiter" step="0.01" value="${prefill.pricePerLiter || ''}">
            <label>Полный бак? <input type="checkbox" name="fullTank" value="true"></label>
            <label>Примечание</label><input type="text" name="notes">
            <div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>
        </form>
    `);
    const form = modal.querySelector('#fuel-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        await appendSheet('FuelLog!A:F', [[d.date, d.mileage, d.liters, d.pricePerLiter, d.fullTank || '', d.notes || '']]);
        modal.remove(); await loadSheet();
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}
// ==================== 16. СТАТИСТИКА ====================
function renderStats() {
    const oilOp = operations.find(op => op.name.includes('Масло') && op.category.includes('ДВС'));
    if (oilOp) {
        const plan = calculatePlan(oilOp);
        const canvas = document.getElementById('oilChart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const current = settings.currentMileage;
            const last = oilOp.lastMileage || 0;
            const next = plan.planMileage;
            const percent = Math.min(100, Math.max(0, Math.round((current - last) / (next - last) * 100)));
            // Уничтожаем старый график, если есть
            const existingChart = Chart.getChart(canvas);
            if (existingChart) existingChart.destroy();
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Пройдено', 'Осталось'],
                    datasets: [{
                        data: [percent, 100 - percent],
                        backgroundColor: ['#2ecc71', '#e0e0e0']
                    }]
                },
                options: { cutout: '70%', plugins: { legend: { display: false } } }
            });
        }
    }

    // График затрат (заглушка)
    const costsCanvas = document.getElementById('costsChart');
    if (costsCanvas) {
        const ctx = costsCanvas.getContext('2d');
        const existingChart = Chart.getChart(costsCanvas);
        if (existingChart) existingChart.destroy();
        new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Янв', 'Фев', 'Мар'], datasets: [{ label: 'Затраты (₽)', data: [0, 0, 0] }] }
        });
    }
}

// ==================== ИСТОРИЯ ====================
async function loadHistory() {
    if (!spreadsheetId) return;
    try {
        const historyData = await readSheet('История!A2:J');
        const tbody = document.getElementById('history-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        historyData.reverse().forEach(row => {
            const tr = document.createElement('tr');
            const opId = row[0];
            const op = operations.find(o => o.id == opId) || { name: 'Неизвестно' };
            tr.innerHTML = `
                <td>${row[1] || ''}</td>
                <td>${op.name}</td>
                <td>${row[2] || ''}</td>
                <td>${row[3] || ''}</td>
                <td>${row[4] || ''}</td>
                <td>${row[5] || ''}</td>
                <td>${row[7] || ''}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.warn('История не загружена:', e);
    }
}


// ==================== 17. ОБРАБОТЧИКИ ====================
function attachTOListeners() {
    document.querySelectorAll('.add-record-btn').forEach(b => b.addEventListener('click', e => openServiceModal(b.dataset.opId, b.dataset.opName)));
    document.querySelectorAll('.edit-op-btn').forEach(b => b.addEventListener('click', e => openOperationForm(operations.find(o => o.id == b.dataset.opId))));
    document.querySelectorAll('.calendar-btn').forEach(b => b.addEventListener('click', e => addToCalendar(b.dataset.opName, b.dataset.planDate, b.dataset.planMileage)));
    document.querySelectorAll('.shopping-list-btn').forEach(b => b.addEventListener('click', e => generateShoppingList(b.dataset.opId)));
}

async function addToCalendar(opName, planDate, planMileage) {
    if (!accessToken) { alert('Авторизуйтесь'); return; }
    let minutesBefore = 14 * 24 * 60;
    if (opName.includes('ОСАГО')) minutesBefore = 1 * 24 * 60;
    const event = {
        summary: `🔧 ТО: ${opName}`, description: `Пробег: ${planMileage} км`,
        start: { date: planDate }, end: { date: planDate },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: minutesBefore }] }
    };
    try {
        await apiCall('https://www.googleapis.com/calendar/v3/calendars/primary/events', { method: 'POST', body: JSON.stringify(event) });
        alert(`✅ Добавлено в календарь`);
    } catch (e) { alert(`❌ Ошибка`); }
}

function generateShoppingList(opId) {
    const op = operations.find(o => o.id == opId);
    const items = parts.filter(p => p.operation === op.name || p.operation === op.category);
    if (!items.length) { alert('Нет запчастей'); return; }
    let list = `🛒 ${op.name}:\n`;
    items.forEach(p => { list += `- ${p.oem || p.analog} ${p.price ? p.price+'₽' : ''}\n`; });
    alert(list);
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
    form.onsubmit = async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        const row = [d.operation, d.oem, d.analog, d.price, d.supplier, d.link, d.comment];
        if (part) await writeSheet(`PartsCatalog!A${part.id}:G${part.id}`, [row]);
        else await appendSheet('PartsCatalog!A:G', [row]);
        modal.remove(); await loadSheet();
    };
    modal.querySelector('.cancel-btn').onclick = () => modal.remove();
}

async function saveSettings() {
    settings.currentMileage = +document.getElementById('set-mileage').value;
    settings.currentMotohours = +document.getElementById('set-motohours').value;
    settings.avgDailyMileage = +document.getElementById('set-avg-mileage').value;
    settings.avgDailyMotohours = +document.getElementById('set-avg-motohours').value;
    settings.telegramToken = document.getElementById('telegram-token').value;
    settings.telegramChatId = document.getElementById('telegram-chatid').value;
    settings.notificationMethod = document.getElementById('notification-method').value;
    localStorage.setItem('notificationMethod', settings.notificationMethod);
    await writeSheet('Журнал ТО!Q1:Q8', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours],[], [], [settings.telegramToken],[settings.telegramChatId]]);
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
    reader.onload = async (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            operations = d.operations; settings = d.settings; parts = d.parts || [];
            fuelLog = d.fuelLog || []; tireLog = d.tireLog || []; workCosts = d.workCosts || [];
            renderAll(); if (isOnline) await syncAllToSheet();
        } catch (err) { alert('Ошибка импорта'); }
    };
    reader.readAsText(file); e.target.value = '';
}

async function syncAllToSheet() {
    const opsRows = operations.map(o => [o.category, o.name, o.lastDate||'', o.lastMileage||'', o.lastMotohours||'', o.intervalKm, o.intervalMonths, o.intervalMotohours||'']);
    await writeSheet('Журнал ТО!A2:H', opsRows);
    await writeSheet('Журнал ТО!Q1:Q8', [[settings.currentMileage],[settings.currentMotohours],[settings.avgDailyMileage],[settings.avgDailyMotohours],[],[],[settings.telegramToken],[settings.telegramChatId]]);
}
// ==================== 21. ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ====================
function initEventListeners() {
    authBtn.addEventListener('click', (e) => {
        e.preventDefault();
        startAuth();
    });
    loadSheetBtn.onclick = loadSheet;
    document.getElementById('recalculate-btn').onclick = () => { renderTOTable(); updateNextServiceWidget(); };
    document.getElementById('export-btn').onclick = exportData;
    document.getElementById('import-btn').onclick = () => document.getElementById('import-file').click();
    document.getElementById('import-file').onchange = importData;
    document.getElementById('add-operation-btn').onclick = () => openOperationForm();
    document.getElementById('add-part-btn').onclick = () => openPartForm();
    document.getElementById('add-fuel-btn').onclick = () => openFuelModal({});
    document.getElementById('voice-fuel-btn').onclick = startVoiceInput;
    document.getElementById('save-settings-btn').onclick = saveSettings;
    document.getElementById('subscribe-push-btn').onclick = subscribeToPush;
    document.getElementById('open-photo-folder-btn').onclick = () => window.open(`https://drive.google.com/drive/folders/${driveFolderId}`, '_blank');
    document.getElementById('share-table-btn').onclick = () => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank');
    themeToggle.onclick = () => { document.body.classList.toggle('dark'); themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙'; };

    document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            if (btn.dataset.tab === 'history') {
            loadHistory();
        }
    });
});

    window.addEventListener('online', () => { isOnline = true; syncPendingActions(); });
    window.addEventListener('offline', () => { isOnline = false; setSyncStatus('error'); });
}

// ==================== 22. ЗАПУСК ====================
pendingActions = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
settings.notificationMethod = localStorage.getItem('notificationMethod') || 'telegram';
initGoogleApi();
initEventListeners();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');