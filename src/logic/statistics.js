// src/logic/statistics.js
window.App = window.App || {};
App.logic = App.logic || {};

/**
 * Возвращает начальную дату для заданного периода.
 * @param {string} period - 'week', 'month', 'quarter', '6months', 'year'
 * @returns {Date|null}
 */
App.logic.getStartDateForPeriod = function(period) {
    var now = new Date();
    switch (period) {
        case 'week': return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        case 'month': return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        case '6months': return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        case 'year': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        default: return null;
    }
};

/**
 * Фильтрует массив записей по периоду.
 * @param {Array} records - Массив объектов с полем date
 * @param {string} period - Период ('all' или конкретный)
 * @param {string} [dateField='date'] - Имя поля с датой
 * @returns {Array}
 */
App.logic.filterByPeriod = function(records, period, dateField) {
    dateField = dateField || 'date';
    if (period === 'all') return records;
    var start = App.logic.getStartDateForPeriod(period);
    if (!start) return records;
    return records.filter(function(r) {
        var d = r[dateField] ? new Date(r[dateField]) : null;
        return d && d >= start;
    });
};

/**
 * Вычисляет статистику за выбранный период.
 * @param {string} [period='all']
 * @returns {Object} { totalMaintenanceCost, totalFuelCost, costPerKm, avgFuelConsumption, avgMileagePerDay, avgMotohoursPerDay }
 */
App.logic.calculateStatistics = function(period) {
    period = period || 'all';
    var fServ = App.logic.filterByPeriod(App.store.serviceRecords, period);
    var fFuel = App.logic.filterByPeriod(App.store.fuelLog, period);
    var fMile = App.logic.filterByPeriod(App.store.mileageHistory, period);

    var totalMaint = fServ.reduce(function(s, r) {
        return s + (Number(r.parts_cost) || 0) + (Number(r.work_cost) || 0);
    }, 0);
    var totalFuel = fFuel.reduce(function(s, f) {
        return s + (Number(f.liters) || 0) * (Number(f.pricePerLiter) || 0);
    }, 0);

    var periodMileage = 0, periodDays = 1, periodMotohours = 0;
    if (fMile.length >= 2) {
        var first = fMile[0], last = fMile[fMile.length - 1];
        periodMileage = last.mileage - first.mileage;
        periodDays = Math.ceil((new Date(last.date) - new Date(first.date)) / 86400000) || 1;
        periodMotohours = (last.motohours || 0) - (first.motohours || 0);
    } else if (fMile.length === 1) {
        var r = fMile[0];
        periodMileage = App.store.settings.currentMileage - (App.store.baseMileage || r.mileage);
        periodDays = App.store.ownershipDays || 1;
        periodMotohours = App.store.settings.currentMotohours - (App.store.baseMotohours || r.motohours);
    } else {
        periodMileage = App.store.settings.currentMileage - (App.store.baseMileage || 0);
        periodDays = App.store.ownershipDays || 1;
        periodMotohours = App.store.settings.currentMotohours - (App.store.baseMotohours || 0);
    }

    var totalCost = totalMaint + totalFuel;
    var costPerKm = periodMileage > 0 ? totalCost / periodMileage : 0;
    var totalLiters = fFuel.reduce(function(s, f) { return s + (Number(f.liters) || 0); }, 0);
    var avgCons = periodMileage > 0 ? (totalLiters / periodMileage) * 100 : 0;

    var avgMileageDay = 0, avgMotoDay = 0;
    if (fMile.length >= 2) {
        var first2 = fMile[0], last2 = fMile[fMile.length - 1];
        var days2 = Math.ceil((new Date(last2.date) - new Date(first2.date)) / 86400000) || 1;
        avgMileageDay = (last2.mileage - first2.mileage) / days2;
        avgMotoDay = ((last2.motohours || 0) - (first2.motohours || 0)) / days2;
    } else {
        avgMileageDay = periodMileage / periodDays;
        avgMotoDay = periodMotohours / periodDays;
    }

    return {
        totalMaintenanceCost: Number(totalMaint),
        totalFuelCost: Number(totalFuel),
        costPerKm: Number(costPerKm),
        avgFuelConsumption: Number(avgCons),
        avgMileagePerDay: Number(avgMileageDay),
        avgMotohoursPerDay: Number(avgMotoDay)
    };
};

/**
 * Группирует топливные записи по месяцам и вычисляет средний расход и цену.
 * @returns {Array<{ yearMonth: string, avgConsumption: number|null, avgPrice: number|null }>}
 */
App.logic.groupFuelByMonth = function() {
    var sorted = App.store.fuelLog.filter(function(r) { return r.date && r.mileage; })
        .sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    var monthlyConsumption = {};

    for (var i = 1; i < sorted.length; i++) {
        var prev = sorted[i - 1];
        var curr = sorted[i];
        var mileageDiff = curr.mileage - prev.mileage;
        if (mileageDiff <= 0) continue;
        var consumption = (curr.liters / mileageDiff) * 100;
        if (!isFinite(consumption)) continue;
        var date = new Date(curr.date);
        var yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        if (!monthlyConsumption[yearMonth]) {
            monthlyConsumption[yearMonth] = { values: [], totalPrice: 0, count: 0 };
        }
        monthlyConsumption[yearMonth].values.push(consumption);
        monthlyConsumption[yearMonth].totalPrice += curr.liters * curr.pricePerLiter;
        monthlyConsumption[yearMonth].count++;
    }

    var monthlyPrice = {};
    sorted.forEach(function(r) {
        if (!r.liters || !r.pricePerLiter) return;
        var date = new Date(r.date);
        var yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        if (!monthlyPrice[yearMonth]) {
            monthlyPrice[yearMonth] = { totalCost: 0, totalLiters: 0 };
        }
        monthlyPrice[yearMonth].totalCost += r.liters * r.pricePerLiter;
        monthlyPrice[yearMonth].totalLiters += r.liters;
    });

    var allMonths = [];
    var seen = {};
    Object.keys(monthlyConsumption).forEach(function(m) { if (!seen[m]) { allMonths.push(m); seen[m] = true; } });
    Object.keys(monthlyPrice).forEach(function(m) { if (!seen[m]) { allMonths.push(m); seen[m] = true; } });

    var result = [];
    for (var j = 0; j < allMonths.length; j++) {
        var month = allMonths[j];
        var consData = monthlyConsumption[month];
        var avgCons = null;
        if (consData && consData.values.length) {
            var sumCons = consData.values.reduce(function(a, b) { return a + b; }, 0);
            avgCons = sumCons / consData.values.length;
        }
        var priceData = monthlyPrice[month];
        var avgPrice = null;
        if (priceData && priceData.totalLiters) {
            avgPrice = priceData.totalCost / priceData.totalLiters;
        }
        result.push({ yearMonth: month, avgConsumption: avgCons, avgPrice: avgPrice });
    }
    return result.sort(function(a, b) { return a.yearMonth.localeCompare(b.yearMonth); });
};

/**
 * Группирует затраты по месяцам для графиков.
 * @param {string} period
 * @returns {{ months: string[], fuelCosts: number[], toCosts: number[] }}
 */
App.logic.groupCostsByMonth = function(period) {
    var filteredFuel = App.logic.filterByPeriod(App.store.fuelLog, period, 'date');
    var filteredService = App.logic.filterByPeriod(App.store.serviceRecords, period, 'date');

    var fuelByMonth = {};
    var toByMonth = {};

    filteredFuel.forEach(function(record) {
        if (!record.date || !record.liters || !record.pricePerLiter) return;
        var date = new Date(record.date);
        if (isNaN(date.getTime())) return;
        var yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        var cost = record.liters * record.pricePerLiter;
        fuelByMonth[yearMonth] = (fuelByMonth[yearMonth] || 0) + cost;
    });

    filteredService.forEach(function(record) {
        if (!record.date) return;
        var date = new Date(record.date);
        if (isNaN(date.getTime())) return;
        var yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        var parts = Number(record.parts_cost) || 0;
        var work = Number(record.work_cost) || 0;
        toByMonth[yearMonth] = (toByMonth[yearMonth] || 0) + parts + work;
    });

    var allMonthsSet = {};
    Object.keys(fuelByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    Object.keys(toByMonth).forEach(function(m) { allMonthsSet[m] = true; });
    var months = Object.keys(allMonthsSet).sort();

    var fuelCosts = months.map(function(m) { return fuelByMonth[m] || 0; });
    var toCosts = months.map(function(m) { return toByMonth[m] || 0; });

    return { months: months, fuelCosts: fuelCosts, toCosts: toCosts };
};

/**
 * Структура расходов по категориям для круговой диаграммы.
 * @param {string} period
 * @returns {{ labels: string[], values: number[], colors: string[] }}
 */
App.logic.calculateExpenseStructure = function(period) {
    var filteredFuel = App.logic.filterByPeriod(App.store.fuelLog, period, 'date');
    var fuelCost = filteredFuel.reduce(function(s, r) { return s + (r.liters * r.pricePerLiter); }, 0);

    var filteredService = App.logic.filterByPeriod(App.store.serviceRecords, period, 'date');
    var toCost = 0, tiresCost = 0, insuranceCost = 0;

    filteredService.forEach(function(rec) {
        var op = App.store.operations.find(function(o) { return o.id == rec.operation_id; });
        if (op && op.category === 'Документы' && op.name.indexOf('ОСАГО') !== -1) {
            insuranceCost += Number(rec.parts_cost) || 0;
        } else {
            toCost += (Number(rec.parts_cost) || 0) + (Number(rec.work_cost) || 0);
        }
    });

    var filteredTires = App.logic.filterByPeriod(App.store.tireLog, period, 'date');
    filteredTires.forEach(function(t) {
        tiresCost += (t.purchaseCost || 0);
        if (t.mileage !== 0 && t.mountCost) tiresCost += t.mountCost;
    });

    var labels = [], values = [], colors = [];
    if (fuelCost > 0) { labels.push('Топливо'); values.push(fuelCost); colors.push('#3498db'); }
    if (toCost > 0) { labels.push('ТО'); values.push(toCost); colors.push('#e74c3c'); }
    if (tiresCost > 0) { labels.push('Шины'); values.push(tiresCost); colors.push('#2ecc71'); }
    if (insuranceCost > 0) { labels.push('ОСАГО'); values.push(insuranceCost); colors.push('#f39c12'); }

    return { labels: labels, values: values, colors: colors };
};

/**
 * Прогнозирует дату достижения заданного пробега на основе линейной регрессии.
 * @param {number} targetMileage
 * @returns {Date|null}
 */
App.logic.predictMileageDate = function(targetMileage) {
    var history = App.store.mileageHistory;
    if (history.length < 2) return null;

    var dates = history.map(function(entry) { return new Date(entry.date).getTime(); });
    var mileages = history.map(function(entry) { return entry.mileage; });

    var minDate = Math.min.apply(null, dates);
    var x = dates.map(function(d) { return (d - minDate) / (1000 * 3600 * 24); });
    var y = mileages;

    var n = x.length;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
    }

    var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    var intercept = (sumY - slope * sumX) / n;
    var predictedDay = (targetMileage - intercept) / slope;
    if (predictedDay < 0) return null;
    return new Date(minDate + predictedDay * 86400000);
};

/**
 * Определяет текущий режим вождения по средней скорости.
 * @returns {{ text: string, hint: string }}
 */
App.logic.getDrivingMode = function() {
    var avgSpeed = null;
    var s = App.store.settings;
    if (s.currentMotohours > 0 && s.currentMileage > 0) {
        avgSpeed = s.currentMileage / s.currentMotohours;
    } else {
        var mh = App.store.mileageHistory;
        if (mh.length >= 2) {
            var first = mh[0];
            var last = mh[mh.length - 1];
            var mDiff = last.mileage - first.mileage;
            var hDiff = (last.motohours || 0) - (first.motohours || 0);
            if (hDiff > 0) avgSpeed = mDiff / hDiff;
        }
    }
    if (avgSpeed === null) return { text: 'Нет данных', hint: '' };
    if (avgSpeed < 25) return { text: 'Городской (' + avgSpeed.toFixed(1) + ' км/ч)', hint: 'Интервал масла: 200 м/ч' };
    if (avgSpeed <= 45) return { text: 'Смешанный (' + avgSpeed.toFixed(1) + ' км/ч)', hint: 'Интервал масла: 225 м/ч' };
    return { text: 'Трассовый (' + avgSpeed.toFixed(1) + ' км/ч)', hint: 'Интервал масла: 250 м/ч' };
};