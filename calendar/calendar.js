(function () {
  'use strict';

  var STORAGE_KEY   = 'holidayHacker_user';
  var OVERRIDES_KEY = 'holidayHacker_overrides';
  var CUSTOM_KEY    = 'holidayHacker_custom';
  var CAL_DONE_KEY  = 'holidayHacker_calSetup';
  var DB_BASE       = '../database/holiday';
  var SC_JSON       = '../database/state-city/data.json';

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var DAYS_FULL  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  /* ─── DOM ──────────────────────────────────────────── */
  var monthTitle    = document.getElementById('monthTitle');
  var monthChevron  = document.getElementById('monthChevron');
  var monthSelector = document.getElementById('monthSelector');
  var monthDropdown = document.getElementById('monthDropdown');
  var prevBtn       = document.getElementById('prevMonth');
  var nextBtn       = document.getElementById('nextMonth');
  var calGrid       = document.getElementById('calGrid');
  var calWeekdays   = document.getElementById('calWeekdays');
  var calSwipeArea  = document.getElementById('calSwipeArea');
  var calMain       = document.getElementById('calMain');
  var calEventsList = document.getElementById('calEventsList');

  /* ─── State ────────────────────────────────────────── */
  var user      = {};
  var stateData = { states: [] };
  var viewMonth = new Date().getMonth();
  var viewYear  = new Date().getFullYear();
  var holidayMap = {};
  var nowDate   = new Date();
  var todayISO  = nowDate.getFullYear() + '-' +
    String(nowDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(nowDate.getDate()).padStart(2, '0');

  /* ─── Weekly-off logic (from user preference) ──────── */

  function getWeekOffDays() {
    var pref = user.weeklyOff || 'sat-sun';
    if (pref === 'sun-only')    return [0];
    if (pref === 'sat-sun')     return [6, 0];
    if (pref === '2nd-4th-sat') return [0];
    return [6, 0];
  }

  function is2nd4thSat(dateObj) {
    if (dateObj.getDay() !== 6) return false;
    var day = dateObj.getDate();
    var week = Math.ceil(day / 7);
    return week === 2 || week === 4;
  }

  /* ─── Data helpers (mirrored from timeline) ────────── */

  function stateCodeFromLocation(loc) {
    if (!loc) return null;
    var parts = loc.split(',');
    var sn = parts[parts.length - 1].trim().toLowerCase();
    for (var i = 0; i < stateData.states.length; i++) {
      if (stateData.states[i].name.toLowerCase() === sn) return stateData.states[i].code;
    }
    return null;
  }

  function fetchHolidays(code, year) {
    var url = DB_BASE + '/' + year + '/in/' + code.toLowerCase() + '.json';
    return fetch(url).then(function (r) {
      if (!r.ok) return [];
      return r.json().then(function (d) { return d.holidays || []; });
    }).catch(function () { return []; });
  }

  function loadAllHolidays(code) {
    var years = [viewYear];
    if (viewMonth === 11) years.push(viewYear + 1);
    if (viewMonth === 0)  years.push(viewYear - 1);
    var proms = years.map(function (y) { return fetchHolidays(code, y); });
    return Promise.all(proms).then(function (res) {
      var all = [];
      res.forEach(function (a) { all = all.concat(a); });
      return all;
    });
  }

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function getCustomHolidays() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function buildHolidayMap(workList, homeList, workSN, homeSN) {
    holidayMap = {};
    var ov = getOverrides();

    function add(h, ctx) {
      var origDate = h.date;
      var patch = ov[origDate];
      if (patch && patch._hidden) return;
      var name = patch ? (patch.name || h.name) : h.name;
      var date = patch ? (patch.date || h.date) : h.date;
      var c    = patch ? (patch.ctx  || ctx)    : ctx;
      if (!holidayMap[date]) {
        holidayMap[date] = { name: name, _ctx: c };
      }
    }

    workList.filter(function (h) { return h.type === 'gazetted'; })
            .forEach(function (h) { add(h, 'work'); });
    homeList.filter(function (h) { return h.type === 'gazetted'; })
            .forEach(function (h) { if (!holidayMap[h.date]) add(h, 'home'); });

    getCustomHolidays().forEach(function (c) {
      var d = c.date;
      if (!holidayMap[d]) holidayMap[d] = { name: c.name, _ctx: 'personal' };
    });
  }

  /* ─── Free holiday streak detection (red outline) ──── */
  var freeStreakSet = {};

  function isWorkHoliday(iso) {
    var h = holidayMap[iso];
    return h && h._ctx === 'work';
  }

  function isWeekOffRaw(jsDay, dateObj) {
    var offDays = getWeekOffDays();
    if (offDays.indexOf(jsDay) !== -1) return true;
    if (user.weeklyOff === '2nd-4th-sat' && dateObj && is2nd4thSat(dateObj)) return true;
    return false;
  }

  function isWeekOff(jsDay, dateObj) {
    return isWeekOffRaw(jsDay, dateObj);
  }

  function isDayOff(iso) {
    var dt = new Date(iso + 'T00:00:00');
    return isWeekOffRaw(dt.getDay(), dt) || isWorkHoliday(iso);
  }

  function isoFor(viewY, viewM, day) {
    return viewY + '-' + String(viewM + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function prevDayISO(iso) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nextDayISO(iso) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildFreeStreaks() {
    freeStreakSet = {};
    var gifts = window._advisorGifts || [];
    if (gifts.length) {
      gifts.forEach(function (g) {
        (g._dates || []).forEach(function (iso) { freeStreakSet[iso] = true; });
      });
      return;
    }
    var dim = new Date(viewYear, viewMonth + 1, 0).getDate();
    var prevDim = new Date(viewYear, viewMonth, 0).getDate();
    var prevM = viewMonth === 0 ? 11 : viewMonth - 1;
    var prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
    var nextM = viewMonth === 11 ? 0 : viewMonth + 1;
    var nextY = viewMonth === 11 ? viewYear + 1 : viewYear;

    var streaks = [];
    var current = [];

    for (var d = prevDim - 6; d <= prevDim; d++) {
      if (d < 1) continue;
      var iso = isoFor(prevY, prevM, d);
      if (isDayOff(iso)) {
        current.push(iso);
      } else {
        if (current.length >= 3) streaks.push(current.slice());
        current = [];
      }
    }
    for (var d = 1; d <= dim; d++) {
      var iso = isoFor(viewYear, viewMonth, d);
      if (isDayOff(iso)) {
        current.push(iso);
      } else {
        if (current.length >= 3) streaks.push(current.slice());
        current = [];
      }
    }
    for (var d = 1; d <= 7; d++) {
      var iso = isoFor(nextY, nextM, d);
      if (isDayOff(iso)) {
        current.push(iso);
      } else {
        if (current.length >= 3) streaks.push(current.slice());
        current = [];
      }
    }
    if (current.length >= 3) streaks.push(current);

    streaks.forEach(function (s) {
      s.forEach(function (iso) { freeStreakSet[iso] = true; });
    });
  }

  /* ─── Mega-Bridge & Golden Bridge detection ── */
  var bridgeLeaveDaySet = {};
  var bridgeFullSet = {};
  var megaFullSet = {};

  function buildBridgeHighlights() {
    bridgeLeaveDaySet = {};
    bridgeFullSet = {};
    megaFullSet = {};

    var monthPrefix = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');

    var megas = window._advisorMegaBridges || [];
    megas.forEach(function (m) {
      var inMonth = false;
      m._dates.forEach(function (iso) {
        if (iso.slice(0, 7) === monthPrefix) inMonth = true;
      });
      if (!inMonth) return;
      m._dates.forEach(function (iso) { megaFullSet[iso] = true; });
    });

    var bridges = window._advisorBridgesAll || window._advisorBridges || [];
    bridges.forEach(function (b) {
      var inMonth = false;
      b._dates.forEach(function (iso) {
        if (iso.slice(0, 7) === monthPrefix) inMonth = true;
      });
      if (!inMonth) return;
      b._dates.forEach(function (iso) {
        if (!megaFullSet[iso]) bridgeFullSet[iso] = true;
      });
      b.leaveDays.forEach(function (iso) {
        bridgeLeaveDaySet[iso] = true;
      });
    });
  }

  /* ─── Calendar grid rendering ──────────────────────── */

  function renderWeekdays() {
    var pref = user.weeklyOff || 'sat-sun';
    var spans = calWeekdays.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      var jsDay = (i + 1) % 7;
      var off = false;
      if (pref === 'sat-sun')      off = (jsDay === 6 || jsDay === 0);
      else if (pref === 'sun-only') off = (jsDay === 0);
      else if (pref === '2nd-4th-sat') off = (jsDay === 0 || jsDay === 6);
      else                          off = (jsDay === 6 || jsDay === 0);
      spans[i].classList.toggle('calendar-weekday--off', off);
    }
  }

  function renderGrid() {
    var firstDay = new Date(viewYear, viewMonth, 1);
    var startDow = (firstDay.getDay() + 6) % 7;
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    var prevViewMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    var prevViewYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    var nextViewMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    var nextViewYear = viewMonth === 11 ? viewYear + 1 : viewYear;

    var cells = [];
    var isPastMonth = (viewYear < nowDate.getFullYear()) ||
                      (viewYear === nowDate.getFullYear() && viewMonth < nowDate.getMonth());

    for (var p = startDow - 1; p >= 0; p--) {
      var pd = prevMonthDays - p;
      var pIso = prevViewYear + '-' + String(prevViewMonth + 1).padStart(2, '0') + '-' + String(pd).padStart(2, '0');
      var pHoliday = holidayMap[pIso] && (holidayMap[pIso]._ctx === 'work' || holidayMap[pIso]._ctx === 'home') ? holidayMap[pIso] : null;
      cells.push({ day: pd, other: true, iso: pIso, holiday: pHoliday });
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var iso = viewYear + '-' + String(viewMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dt  = new Date(viewYear, viewMonth, d);
      cells.push({
        day: d,
        iso: iso,
        jsDay: dt.getDay(),
        dateObj: dt,
        isToday: iso === todayISO,
        holiday: holidayMap[iso] || null,
        weekOff: isWeekOff(dt.getDay(), dt)
      });
    }
    var remainder = 7 - (cells.length % 7);
    if (remainder < 7) {
      for (var n = 1; n <= remainder; n++) {
        var nIso = nextViewYear + '-' + String(nextViewMonth + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');
        var nHoliday = holidayMap[nIso] && (holidayMap[nIso]._ctx === 'work' || holidayMap[nIso]._ctx === 'home') ? holidayMap[nIso] : null;
        cells.push({ day: n, other: true, iso: nIso, holiday: nHoliday });
      }
    }

    var html = '';
    cells.forEach(function (c) {
      if (c.other) {
        var dot = '';
        var wrapCls = 'calendar-day-wrap';
        var otherCls = 'calendar-day calendar-day--other';
        if (c.holiday) {
          otherCls += ' calendar-day--other-holiday calendar-day--other-' + c.holiday._ctx;
          var dotCls = c.holiday._ctx === 'work' ? 'calendar-day-dot--other-work' : 'calendar-day-dot--other-home';
          dot = '<span class="calendar-day-dot calendar-day-dot--other ' + dotCls + '"></span>';
        }
        var prevIso = prevDayISO(c.iso);
        var nextIso = nextDayISO(c.iso);
        var isMega = !!megaFullSet[c.iso];
        var isBridge = !!bridgeFullSet[c.iso];
        var isFree = !!freeStreakSet[c.iso];
        if (isMega) {
          var prevM = !!megaFullSet[prevIso];
          var nextM = !!megaFullSet[nextIso];
          wrapCls += ' calendar-day-wrap--mega';
          if (!prevM) wrapCls += ' calendar-day-wrap--mega-start';
          if (!nextM) wrapCls += ' calendar-day-wrap--mega-end';
        } else if (isBridge) {
          var prevB = !!bridgeFullSet[prevIso];
          var nextB = !!bridgeFullSet[nextIso];
          wrapCls += ' calendar-day-wrap--bridge';
          if (!prevB) wrapCls += ' calendar-day-wrap--bridge-start';
          if (!nextB) wrapCls += ' calendar-day-wrap--bridge-end';
        } else if (isFree) {
          var prevF = !!freeStreakSet[prevIso];
          var nextF = !!freeStreakSet[nextIso];
          wrapCls += ' calendar-day-wrap--gb';
          if (!prevF) wrapCls += ' calendar-day-wrap--gb-start';
          if (!nextF) wrapCls += ' calendar-day-wrap--gb-end';
        }
        html += '<div class="' + wrapCls + '"><button type="button" class="' + otherCls + '">' + c.day + dot + '</button></div>';
        return;
      }
      var wrapCls = 'calendar-day-wrap';
      var cls = 'calendar-day';
      var dot = '';

      var isFreeStreak = !!freeStreakSet[c.iso];
      var isMegaFull = !!megaFullSet[c.iso];
      var isBridgeFull = !!bridgeFullSet[c.iso];

      if (isMegaFull) {
        var prevM = !!megaFullSet[prevDayISO(c.iso)];
        var nextM = !!megaFullSet[nextDayISO(c.iso)];
        wrapCls += ' calendar-day-wrap--mega';
        if (!prevM) wrapCls += ' calendar-day-wrap--mega-start';
        if (!nextM) wrapCls += ' calendar-day-wrap--mega-end';
        if (prevM && nextM) wrapCls += ' calendar-day-wrap--mega-mid';
      } else if (isBridgeFull) {
        var prevBF = !!bridgeFullSet[prevDayISO(c.iso)];
        var nextBF = !!bridgeFullSet[nextDayISO(c.iso)];
        wrapCls += ' calendar-day-wrap--bridge';
        if (!prevBF) wrapCls += ' calendar-day-wrap--bridge-start';
        if (!nextBF) wrapCls += ' calendar-day-wrap--bridge-end';
        if (prevBF && nextBF) wrapCls += ' calendar-day-wrap--bridge-mid';
      } else if (isFreeStreak) {
        var prevGB = !!freeStreakSet[prevDayISO(c.iso)];
        var nextGB = !!freeStreakSet[nextDayISO(c.iso)];
        wrapCls += ' calendar-day-wrap--gb';
        if (!prevGB)  wrapCls += ' calendar-day-wrap--gb-start';
        if (!nextGB)  wrapCls += ' calendar-day-wrap--gb-end';
        if (prevGB && nextGB) wrapCls += ' calendar-day-wrap--gb-mid';
      }

      if (c.holiday) {
        var ctx = c.holiday._ctx;
        if (ctx === 'work')     cls += ' calendar-day--work';
        else if (ctx === 'home') cls += ' calendar-day--home';
        else if (ctx === 'personal') cls += ' calendar-day--personal';
        dot = '<span class="calendar-day-dot"></span>';
      }
      if (c.isToday) cls += ' calendar-day--today';
      if (c.weekOff && !c.holiday) cls += ' calendar-day--weekoff';
      if (isPastMonth || (viewYear === nowDate.getFullYear() && viewMonth === nowDate.getMonth() && c.day < nowDate.getDate())) {
        cls += ' calendar-day--past';
      }
      html += '<div class="' + wrapCls + '"><button type="button" class="' + cls + '">' + c.day + dot + '</button></div>';
    });
    calGrid.innerHTML = html;
  }

  function getGiftStreaks() {
    var gifts = window._advisorGifts || [];
    var monthPrefix = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');
    return gifts.filter(function (g) {
      return (g._dates || []).some(function (iso) { return iso.slice(0, 7) === monthPrefix; });
    });
  }

  function getMegaBridgeStreaks() {
    var megas = window._advisorMegaBridges || [];
    var monthPrefix = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');
    return megas.filter(function (m) {
      return m._dates.some(function (iso) { return iso.slice(0, 7) === monthPrefix; });
    });
  }

  function getGoldenBridgeStreaks() {
    var bridges = window._advisorBridges || [];
    var monthPrefix = viewYear + '-' + String(viewMonth + 1).padStart(2, '0');
    var result = [];

    bridges.forEach(function (b) {
      var inMonth = b._dates.some(function (iso) { return iso.slice(0, 7) === monthPrefix; });
      if (!inMonth) return;
      var datesInMonth = b._dates.filter(function (iso) { return iso.slice(0, 7) === monthPrefix; });
      result.push({
        dates: datesInMonth,
        leaveDays: b.leaveDays,
        name: b.name,
        days: b.days,
        start: b.start,
        end: b.end,
        leaves: b.leaves
      });
    });

    return result;
  }

  var SELECTED_BRIDGES_KEY = 'holidayHacker_selectedBridges';
  var PLANNED_TRIPS_KEY = 'holidayHacker_plannedTrips';

  function getSelectedBridges() {
    try {
      return JSON.parse(localStorage.getItem(SELECTED_BRIDGES_KEY) || '[]');
    } catch (e) { return []; }
  }

  function setSelectedBridge(start, selected) {
    var arr = getSelectedBridges();
    var idx = arr.indexOf(start);
    if (selected && idx === -1) arr.push(start);
    else if (!selected && idx !== -1) arr.splice(idx, 1);
    localStorage.setItem(SELECTED_BRIDGES_KEY, JSON.stringify(arr));
  }

  function isBridgeSelected(start) {
    return getSelectedBridges().indexOf(start) !== -1;
  }

  function getPlannedTrips() {
    try {
      return JSON.parse(localStorage.getItem(PLANNED_TRIPS_KEY) || '[]');
    } catch (e) { return []; }
  }

  function setPlannedTrip(start, planned) {
    var arr = getPlannedTrips();
    var idx = arr.indexOf(start);
    if (planned && idx === -1) arr.push(start);
    else if (!planned && idx !== -1) arr.splice(idx, 1);
    localStorage.setItem(PLANNED_TRIPS_KEY, JSON.stringify(arr));
    window.dispatchEvent(new CustomEvent('tripSelectionChange'));
  }

  function isTripPlanned(start) {
    return getPlannedTrips().indexOf(start) !== -1;
  }

  function renderEvents() {
    var entries = [];
    Object.keys(holidayMap).forEach(function (iso) {
      if (iso.slice(0, 7) === viewYear + '-' + String(viewMonth + 1).padStart(2, '0')) {
        entries.push({ date: iso, name: holidayMap[iso].name, _ctx: holidayMap[iso]._ctx });
      }
    });
    entries.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var html = '';
    var gifts = getGiftStreaks();
    gifts.forEach(function (g) {
      var first = new Date(g.start + 'T00:00:00');
      var last  = new Date(g.end + 'T00:00:00');
      var label = MONTHS[first.getMonth()].slice(0, 3) + ' ' + first.getDate() +
                  ' – ' + MONTHS[last.getMonth()].slice(0, 3) + ' ' + last.getDate();
      var planned = isTripPlanned(g.start);
      var pastCls = g.end < todayISO ? ' calendar-event-card--past' : '';
      html += '<div class="calendar-event-card calendar-event-card--gift' + pastCls + '" data-gift-start="' + g.start + '">' +
        '<div class="calendar-event-icon calendar-event-icon--gift">' +
          '<span class="material-symbols-outlined">celebration</span>' +
        '</div>' +
        '<div class="calendar-event-body">' +
          '<h4>' + g.name + '</h4>' +
          '<p>' + label + '</p>' +
          '<p class="calendar-event-gift-badge">0 Leaves / ' + g.days + ' Days — Free</p>' +
          '<div class="calendar-event-toggle-wrap">' +
            '<span>Plan trip?</span>' +
            '<button type="button" class="advisor-toggle advisor-toggle--plan' + (planned ? ' is-on' : '') + '" aria-label="Plan trip"></button>' +
          '</div>' +
        '</div>' +
        '<span class="calendar-event-meta">Free</span>' +
      '</div>';
    });

    var megas = getMegaBridgeStreaks();
    megas.forEach(function (m) {
      var first = new Date(m.start + 'T00:00:00');
      var last  = new Date(m.end + 'T00:00:00');
      var label = MONTHS[first.getMonth()].slice(0, 3) + ' ' + first.getDate() +
                  ' – ' + MONTHS[last.getMonth()].slice(0, 3) + ' ' + last.getDate();
      var leaveLabels = m.leaveDays.map(function (iso) {
        var d = new Date(iso + 'T00:00:00');
        var dayName = DAYS_FULL[d.getDay()];
        var rest = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
        return '<span class="leave-day-name">' + dayName + '</span> ' + rest;
      });
      var sel = isBridgeSelected(m.start);
      var pastCls = m.end < todayISO ? ' calendar-event-card--past' : '';
      html += '<div class="calendar-event-card calendar-event-card--mega' + pastCls + '" data-bridge-start="' + m.start + '" data-bridge-leaves="' + m.leaves + '">' +
        '<div class="calendar-event-icon calendar-event-icon--mega">' +
          '<span class="material-symbols-outlined">workspace_premium</span>' +
        '</div>' +
        '<div class="calendar-event-body">' +
          '<h4>' + (m.days === 9 ? '9-Day Mega-Bridge' : m.days + '-Day Long Bridge') + '</h4>' +
          '<p>' + label + '</p>' +
          '<p class="calendar-event-mega-roi">' + m.leaves + ' Leaves = ' + m.days + ' Days</p>' +
          '<p class="calendar-event-leave">Leave: ' + leaveLabels.join(', ') + '</p>' +
          '<div class="calendar-event-toggle-wrap">' +
            '<span>Bridge it?</span>' +
            '<button type="button" class="advisor-toggle advisor-toggle--mega' + (sel ? ' is-on' : '') + '" aria-label="Toggle mega bridge"></button>' +
          '</div>' +
        '</div>' +
        '<span class="calendar-event-meta">' + m.leaves + ' Leave' + (m.leaves > 1 ? 's' : '') + '</span>' +
      '</div>';
    });

    var bridges = getGoldenBridgeStreaks();
    bridges.forEach(function (b) {
      var visibleDays = b.dates.length;
      var first = new Date(b.start + 'T00:00:00');
      var last  = new Date(b.end + 'T00:00:00');
      var label = MONTHS[first.getMonth()].slice(0, 3) + ' ' + first.getDate() +
                  ' – ' + MONTHS[last.getMonth()].slice(0, 3) + ' ' + last.getDate();
      var leaveLabels = b.leaveDays.map(function (iso) {
        var d = new Date(iso + 'T00:00:00');
        var dayName = DAYS_FULL[d.getDay()];
        var rest = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
        return '<span class="leave-day-name">' + dayName + '</span> ' + rest;
      });
      var sel = isBridgeSelected(b.start);
      var pastCls = b.end < todayISO ? ' calendar-event-card--past' : '';
      html += '<div class="calendar-event-card calendar-event-card--gb' + pastCls + '" data-bridge-start="' + b.start + '" data-bridge-leaves="' + b.leaves + '">' +
        '<div class="calendar-event-icon calendar-event-icon--gb">' +
          '<span class="material-symbols-outlined">offline_bolt</span>' +
        '</div>' +
        '<div class="calendar-event-body">' +
          '<h4>' + visibleDays + '-Day Golden Bridge</h4>' +
          '<p>' + label + '</p>' +
          '<p class="calendar-event-leave calendar-event-leave--bridge">Leave: ' + leaveLabels.join(', ') + '</p>' +
          '<div class="calendar-event-toggle-wrap">' +
            '<span>Bridge it?</span>' +
            '<button type="button" class="advisor-toggle' + (sel ? ' is-on' : '') + '" aria-label="Toggle bridge"></button>' +
          '</div>' +
        '</div>' +
        '<span class="calendar-event-meta">' + b.leaves + ' Leave' + (b.leaves > 1 ? 's' : '') + '</span>' +
      '</div>';
    });

    if (entries.length) {
      entries.forEach(function (e) {
        var d = new Date(e.date + 'T00:00:00');
        var dayName = DAYS_SHORT[(d.getDay() + 6) % 7];
        var dateStr = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
        var icon, iconCls, label;
        if (e._ctx === 'work')        { icon = 'apartment'; iconCls = 'calendar-event-icon--work'; label = 'Work City'; }
        else if (e._ctx === 'home')   { icon = 'home';      iconCls = 'calendar-event-icon--home'; label = 'Hometown'; }
        else                          { icon = 'person';     iconCls = 'calendar-event-icon--personal'; label = 'Personal'; }

        var pastCls = e.date < todayISO ? ' calendar-event-card--past' : '';
        html += '<div class="calendar-event-card' + pastCls + '">' +
          '<div class="calendar-event-icon ' + iconCls + '">' +
            '<span class="material-symbols-outlined">' + icon + '</span>' +
          '</div>' +
          '<div class="calendar-event-body">' +
            '<h4>' + e.name + '</h4>' +
            '<p>' + dateStr + ' · ' + label + '</p>' +
          '</div>' +
          '<span class="calendar-event-meta">' + dayName + '</span>' +
        '</div>';
      });
    }

    if (!html) {
      calEventsList.innerHTML = '<p class="calendar-events-empty">No breaks this month. Swipe right to find a holiday.</p>';
    } else {
      calEventsList.innerHTML = '<h3 class="calendar-events-title">This Month\'s Breaks</h3>' + html;
    }
  }

  function updateTitle() {
    monthTitle.innerHTML = MONTHS[viewMonth] + ' ' + viewYear +
      ' <span class="material-symbols-outlined" id="monthChevron">expand_more</span>';
    monthChevron = document.getElementById('monthChevron');
  }

  function renderAll() {
    updateTitle();
    buildFreeStreaks();
    buildBridgeHighlights();
    renderGrid();
    renderEvents();
    buildMonthDropdown();
  }

  window.refreshCalendarBreaks = function () {
    buildBridgeHighlights();
    renderGrid();
    renderEvents();
  };

  /* ─── Month navigation ─────────────────────────────── */

  var isAnimating = false;

  function go(delta) {
    if (isAnimating) return;
    isAnimating = true;

    var exitCls = delta > 0 ? 'calendar-grid--exit-left' : 'calendar-grid--exit-right';
    var enterCls = delta > 0 ? 'calendar-grid--enter-right' : 'calendar-grid--enter-left';

    calGrid.classList.add(exitCls);
    calEventsList.classList.add('calendar-events--fading');

    setTimeout(function () {
      viewMonth += delta;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      if (viewMonth < 0)  { viewMonth = 11; viewYear--; }

      calGrid.classList.remove(exitCls);
      calGrid.classList.add(enterCls);
      loadAndRender();

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          calGrid.classList.remove(enterCls);
          calEventsList.classList.remove('calendar-events--fading');
          setTimeout(function () { isAnimating = false; }, 320);
        });
      });
    }, 300);
  }

  prevBtn.addEventListener('click', function () { go(-1); });
  nextBtn.addEventListener('click', function () { go(1); });

  /* Swipe – use calMain so swipes work in calendar grid, legend, and events list */
  var swipeStartX = 0;
  var swiping = false;

  calMain.addEventListener('touchstart', function (e) {
    if (isAnimating) return;
    swipeStartX = e.touches[0].clientX;
    swiping = true;
    calGrid.style.transition = 'none';
  }, { passive: true });

  calMain.addEventListener('touchmove', function (e) {
    if (!swiping) return;
    var dx = e.touches[0].clientX - swipeStartX;
    var clamped = Math.max(-120, Math.min(120, dx));
    calGrid.style.transform = 'translateX(' + clamped + 'px)';
    calGrid.style.opacity = 1 - Math.abs(clamped) / 300;
  }, { passive: true });

  calMain.addEventListener('touchend', function (e) {
    if (!swiping) return;
    swiping = false;
    var diff = e.changedTouches[0].clientX - swipeStartX;
    calGrid.style.transition = '';
    calGrid.style.transform = '';
    calGrid.style.opacity = '';
    if (Math.abs(diff) > 50) {
      go(diff < 0 ? 1 : -1);
    }
  }, { passive: true });

  /* Month dropdown */
  function buildMonthDropdown() {
    var html = '';
    var now = new Date();
    for (var i = -2; i <= 12; i++) {
      var m = (now.getMonth() + i + 120) % 12;
      var y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
      var isActive = m === viewMonth && y === viewYear;
      var isPast = (y < now.getFullYear()) || (y === now.getFullYear() && m < now.getMonth());
      html += '<button type="button" class="calendar-month-option' +
        (isActive ? ' is-active' : '') +
        (isPast ? ' is-past' : '') +
        '" data-m="' + m + '" data-y="' + y + '">' +
        MONTHS[m].slice(0, 3) + ' ' + y + '</button>';
    }
    monthDropdown.innerHTML = html;

    monthDropdown.querySelectorAll('.calendar-month-option').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        viewMonth = parseInt(btn.getAttribute('data-m'));
        viewYear  = parseInt(btn.getAttribute('data-y'));
        monthDropdown.classList.remove('is-open');
        monthChevron.textContent = 'expand_more';
        loadAndRender();
      });
    });
  }

  monthSelector.addEventListener('click', function (e) {
    e.stopPropagation();
    monthDropdown.classList.toggle('is-open');
    monthChevron.textContent = monthDropdown.classList.contains('is-open') ? 'expand_less' : 'expand_more';
  });

  document.addEventListener('click', function () {
    monthDropdown.classList.remove('is-open');
    if (monthChevron) monthChevron.textContent = 'expand_more';
  });

  function loadPersistedAdvisorData() {
    try {
      var raw = localStorage.getItem('holidayHacker_advisorData');
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.gifts) window._advisorGifts = d.gifts;
      if (d.bridges) window._advisorBridges = d.bridges;
      if (d.bridgesAll) window._advisorBridgesAll = d.bridgesAll;
      if (d.megas) window._advisorMegaBridges = d.megas;
    } catch (e) {}
  }

  /* ─── Data loading (combined view like timeline) ───── */

  function loadAndRender() {
    var workCode = stateCodeFromLocation(user.workLocation);
    var homeCode = stateCodeFromLocation(user.homeLocation || user.workLocation);
    var workSN   = user.workLocation || '–';
    var homeSN   = user.homeLocation || workSN;

    var homePromise = (homeCode && homeCode !== workCode)
      ? loadAllHolidays(homeCode) : Promise.resolve([]);

    loadPersistedAdvisorData();
    Promise.all([
      workCode ? loadAllHolidays(workCode) : Promise.resolve([]),
      homePromise
    ]).then(function (res) {
      buildHolidayMap(res[0], res[1], workSN, homeSN);
      renderAll();
    });
  }

  /* ─── Init ─────────────────────────────────────────── */

  calEventsList.addEventListener('click', function (e) {
    var btn = e.target.closest('.advisor-toggle');
    if (!btn) return;
    var bridgeCard = btn.closest('.calendar-event-card--mega, .calendar-event-card--gb');
    var giftCard = btn.closest('.calendar-event-card--gift');
    if (bridgeCard) {
      var start = bridgeCard.getAttribute('data-bridge-start');
      if (!start) return;
      btn.classList.toggle('is-on');
      setSelectedBridge(start, btn.classList.contains('is-on'));
      window.dispatchEvent(new CustomEvent('bridgeSelectionChange'));
    } else if (giftCard) {
      var start = giftCard.getAttribute('data-gift-start');
      if (!start) return;
      btn.classList.toggle('is-on');
      setPlannedTrip(start, btn.classList.contains('is-on'));
      window.dispatchEvent(new CustomEvent('tripSelectionChange'));
    }
  });

  function init() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.location.href = '../index.html';
      return;
    }
    user = JSON.parse(raw);
    if (!user.name && !user.workLocation) {
      window.location.href = '../index.html';
      return;
    }

    renderWeekdays();

    if (localStorage.getItem('holidayHacker_advisorSeen')) {
      var split = document.getElementById('calSplit');
      if (split) split.classList.add('cal-split--seen');
    }

    window.addEventListener('bridgeSelectionChange', function () {
      buildBridgeHighlights();
      renderGrid();
      renderEvents();
    });

    window.addEventListener('tripSelectionChange', function () {
      renderEvents();
    });

    if (typeof window.startCalendarAdvisor === 'function') {
      setTimeout(window.startCalendarAdvisor, 0);
    }

    fetch(SC_JSON)
      .then(function (r) { return r.json(); })
      .then(function (d) { stateData = d; loadAndRender(); })
      .catch(function ()  { loadAndRender(); });
  }

  window.initCalendar = init;

  if (localStorage.getItem(CAL_DONE_KEY)) {
    init();
  }
})();
