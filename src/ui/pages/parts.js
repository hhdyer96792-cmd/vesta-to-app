// src/ui/pages/parts.js
window.App = window.App || {};
App.ui = App.ui || {};
App.ui.pages = App.ui.pages || {};

App.ui.pages.renderPartsTable = function() {
    var tbody = document.getElementById('parts-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    App.store.parts.forEach(function(p) {
        var tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.innerHTML =
            '<td>' + App.utils.escapeHtml(p.operation) + '</td>' +
            '<td>' + App.utils.escapeHtml(p.oem) + '</td>' +
            '<td>' + App.utils.escapeHtml(p.analog) + '</td>' +
            '<td>' + (p.price ? App.utils.escapeHtml(String(p.price)) + ' ₽' : '') + '</td>' +
            '<td>' + App.utils.escapeHtml(p.supplier) + '</td>' +
            '<td>' + (p.link ? '<a href="' + App.utils.escapeHtml(p.link) + '" target="_blank"><i data-lucide="external-link"></i></a>' : '') + '</td>' +
            '<td>' + App.utils.escapeHtml(p.comment) + '</td>' +
            '<td style="text-align:center;">' + (p.inStock || 0) + '</td>' +
            '<td>' + App.utils.escapeHtml(p.location) + '</td>' +
            '<td>' +
                '<button class="icon-btn" data-action="edit-part" data-id="' + p.id + '"><i data-lucide="pencil"></i></button>' +
                '<button class="icon-btn" data-action="delete-part" data-id="' + p.id + '"><i data-lucide="trash-2"></i></button>' +
                '<button class="icon-btn" data-action="search-part" data-oem="' + App.utils.escapeHtml(p.oem) + '"><i data-lucide="search"></i></button>' +
                (p.priceHistory && p.priceHistory.length > 1 ? '<button class="icon-btn" data-action="price-history" data-id="' + p.id + '" title="История цен"><i data-lucide="trending-up"></i></button>' : '') +
            '</td>';
        tbody.appendChild(tr);
    });
    App.initIcons();
};

App.ui.pages.openPartForm = function(part) {
    var isEdit = !!part && !!part.id;
    var operationOptions = '';
    App.store.operations.forEach(function(op) {
        var selected = part && part.operation === op.name ? ' selected' : '';
        operationOptions += '<option value="' + App.utils.escapeHtml(op.name) + '"' + selected + '>' + App.utils.escapeHtml(op.name) + ' (' + App.utils.escapeHtml(op.category) + ')</option>';
    });

    var priceHistoryHtml = '';
    if (part && part.priceHistory && part.priceHistory.length) {
        priceHistoryHtml = '<h4>История цен</h4><ul style="margin-bottom:12px; max-height:150px; overflow-y:auto;">';
        part.priceHistory.forEach(function(entry) {
            priceHistoryHtml += '<li>' + App.utils.escapeHtml(entry.date) + ': ' + entry.price + ' ₽ (' + App.utils.escapeHtml(entry.supplier || '—') + ')</li>';
        });
        priceHistoryHtml += '</ul>';
    }

    var content =
        '<form id="part-form">' +
            '<input type="hidden" name="id" value="' + (part ? part.id : '') + '">' +
            '<label>Операция</label>' +
            '<select name="operation" required><option value="">-- Выберите операцию --</option>' + operationOptions + '</select>' +
            '<label>OEM</label><input type="text" name="oem" value="' + App.utils.escapeHtml(part ? (part.oem || '') : '') + '">' +
            '<label>Аналог</label><input type="text" name="analog" value="' + App.utils.escapeHtml(part ? (part.analog || '') : '') + '">' +
            '<label>Цена (₽)</label><input type="number" name="price" step="0.01" value="' + (part ? (part.price || '') : '') + '">' +
            (isEdit ? '<label><input type="checkbox" id="update-price-only"> Добавить новую цену (не заменять)</label>' : '') +
            '<label>Поставщик</label><input type="text" name="supplier" value="' + App.utils.escapeHtml(part ? (part.supplier || '') : '') + '">' +
            '<label>Ссылка</label><input type="url" name="link" value="' + App.utils.escapeHtml(part ? (part.link || '') : '') + '">' +
            '<label>Комментарий</label><input type="text" name="comment" value="' + App.utils.escapeHtml(part ? (part.comment || '') : '') + '">' +
            '<label>В наличии (шт.)</label><input type="number" name="inStock" min="0" step="1" value="' + (part ? (part.inStock || 0) : 0) + '">' +
            '<label>Место хранения</label><input type="text" name="location" value="' + App.utils.escapeHtml(part ? (part.location || '') : '') + '" placeholder="Гараж, бардачок, полка...">' +
            priceHistoryHtml +
            '<div class="modal-actions"><button type="submit" class="primary-btn">Сохранить</button><button type="button" class="cancel-btn secondary-btn">Отмена</button></div>' +
        '</form>';

    var modal = App.ui.createModal(isEdit ? '✏️ Запчасть' : '➕ Запчасть', content);
    var form = modal.querySelector('#part-form');

    form.onsubmit = function(e) {
        e.preventDefault();
        var d = Object.fromEntries(new FormData(form));
        var updateOnlyPrice = modal.querySelector('#update-price-only')?.checked || false;
        var newPrice = parseFloat(d.price);
        var newSupplier = d.supplier;
        var priceHistory = part && part.priceHistory ? part.priceHistory.slice() : [];

        if (isEdit && updateOnlyPrice && !isNaN(newPrice) && newPrice !== parseFloat(part.price)) {
            priceHistory.push({
                date: new Date().toISOString().split('T')[0],
                price: newPrice,
                supplier: newSupplier
            });
        }

        var existingUuid = (part && part.uuid) ? part.uuid : crypto.randomUUID();
        var existingUpdatedAt = (part && part.updated_at) ? part.updated_at : new Date().toISOString();

        modal.remove();

        var rowData = {
            id: d.id || null,
            uuid: existingUuid,
            updated_at: existingUpdatedAt,
            operation: d.operation,
            oem: d.oem,
            analog: d.analog,
            price: d.price,
            supplier: d.supplier,
            link: d.link,
            comment: d.comment,
            inStock: parseFloat(d.inStock) || 0,
            location: d.location,
            priceHistory: updateOnlyPrice ? priceHistory : (part ? part.priceHistory : [])
        };

        if (isEdit && updateOnlyPrice) {
            part.priceHistory = priceHistory;
            App.store.savePriceHistory();
        }

        if (App.config.USE_SUPABASE) {
            App.storage.savePart(rowData)
                .then(function(res) {
                    if (res && res.data && res.data.length > 0) {
                        rowData.id = res.data[0].id;
                    }
                    var existingIdx = App.store.parts.findIndex(function(p) { return p.id == rowData.id; });
                    if (existingIdx !== -1) {
                        App.store.parts[existingIdx] = rowData;
                        if (updateOnlyPrice) {
                            App.store.parts[existingIdx].priceHistory = priceHistory;
                            App.store.savePriceHistory();
                        }
                    } else {
                        rowData.priceHistory = updateOnlyPrice ? priceHistory : [];
                        App.store.parts.push(rowData);
                    }
                    App.store.saveToLocalStorage();
                    App.ui.pages.renderPartsTable();
                    App.toast(isEdit ? 'Запчасть обновлена' : 'Запчасть добавлена', 'success');
                })
                .catch(function(err) {
                    console.error(err);
                    App.toast('Ошибка сохранения в Supabase', 'error');
                });
        } else {
            if (isEdit) {
                rowData.id = part.id;
                if (App.auth.accessToken) {
                    App.storage.savePart(rowData);
                }
                var idx = App.store.parts.findIndex(function(p) { return p.id == part.id; });
                if (idx !== -1) {
                    App.store.parts[idx] = rowData;
                    if (updateOnlyPrice) {
                        App.store.parts[idx].priceHistory = priceHistory;
                        App.store.savePriceHistory();
                    }
                }
            } else {
                if (!App.auth.accessToken) {
                    rowData.id = App.store.parts.length + 2;
                    App.store.parts.push(rowData);
                } else {
                    App.storage.addPart(rowData);
                }
            }
            App.store.saveToLocalStorage();
            App.ui.pages.renderPartsTable();
            if (App.auth.accessToken) App.loadSheet();
            App.toast(isEdit ? 'Запчасть обновлена' : 'Запчасть добавлена', 'success');
        }
    };

    modal.querySelector('.cancel-btn').onclick = function() { modal.remove(); };
};

App.ui.pages.deletePart = function(partId) {
    if (!partId) { App.toast('Некорректный идентификатор', 'error'); return; }
    App.storage.deletePart(partId).then(function() {
        App.storage.loadAllData();
        App.toast('Запчасть удалена', 'success');
    }).catch(function(err) {
        console.error(err);
        App.toast('Не удалось удалить запчасть (недостаточно прав)', 'error');
    });
};

App.ui.pages.showCatalogMenu = function(button, oem) {
    var existingMenu = document.querySelector('.catalog-popup-menu');
    if (existingMenu) existingMenu.remove();

    var rect = button.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'catalog-popup-menu';
    menu.style.cssText = 'position:fixed; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:8px 0; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:10000; min-width:150px;';

    var catalogs = [
        { name: 'Exist', url: 'https://exist.ru/price/?pcode=' + encodeURIComponent(oem) },
        { name: 'Drive2', url: 'https://www.drive2.ru/search?text=' + encodeURIComponent(oem) },
        { name: 'Basis', url: 'https://basis.ru/search?q=' + encodeURIComponent(oem) },
        { name: 'ZZap', url: 'https://www.zzap.ru/search?part_number=' + encodeURIComponent(oem) }
    ];

    catalogs.forEach(function(cat) {
        var item = document.createElement('div');
        item.textContent = cat.name;
        item.style.cssText = 'padding:8px 16px; cursor:pointer; white-space:nowrap; color:var(--text);';
        item.addEventListener('mouseenter', function() { item.style.background = 'var(--bg)'; });
        item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
        item.addEventListener('click', function() {
            window.open(cat.url, '_blank');
            menu.remove();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    var menuRect = menu.getBoundingClientRect();
    var top = rect.bottom + 5;
    var left = rect.left;
    if (left + menuRect.width > window.innerWidth - 10) left = window.innerWidth - menuRect.width - 10;
    if (left < 10) left = 10;
    if (top + menuRect.height > window.innerHeight - 10) top = rect.top - menuRect.height - 5;
    if (top < 10) top = Math.max(10, (window.innerHeight - menuRect.height) / 2);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    setTimeout(function() {
        var closeHandler = function(e) {
            if (!menu.contains(e.target) && e.target !== button) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
};

App.ui.pages.showPriceHistoryChart = function(part) {
    var history = part.priceHistory;
    if (!history || history.length < 2) {
        App.toast('Недостаточно данных для графика (нужно минимум 2 записи)', 'warning');
        return;
    }
    var sorted = history.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    var labels = sorted.map(function(h) { return h.date; });
    var prices = sorted.map(function(h) { return h.price; });

    var content = '<div style="width:100%; height:300px;"><canvas id="priceHistoryChart" style="width:100%; height:100%;"></canvas></div>' +
                  '<p class="hint">Изменение цены во времени. Данные сохраняются локально.</p>';
    var modal = App.ui.createModal('История цен: ' + part.operation + ' (' + (part.oem || part.analog) + ')', content);

    setTimeout(function() {
        var canvas = document.getElementById('priceHistoryChart');
        if (!canvas) return;

        if (App.charts.activeCharts['priceHistoryChart']) {
            App.charts.activeCharts['priceHistoryChart'].destroy();
            delete App.charts.activeCharts['priceHistoryChart'];
        }

        var ctx = canvas.getContext('2d');
        App.charts.activeCharts['priceHistoryChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Цена (₽)',
                    data: prices,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52,152,219,0.1)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: { callbacks: { label: function(ctx) { return ctx.raw + ' ₽'; } } },
                    legend: { position: 'top' }
                },
                scales: { y: { title: { display: true, text: 'Цена (₽)' }, beginAtZero: false } }
            }
        });
        App.initIcons();
    }, 50);
};