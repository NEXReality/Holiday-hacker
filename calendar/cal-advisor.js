(function () {
  'use strict';

  var STORAGE_KEY   = 'holidayHacker_user';
  var OVERRIDES_KEY = 'holidayHacker_overrides';
  var CAL_DONE_KEY  = 'holidayHacker_calSetup';
  var ADVISOR_SEEN_KEY = 'holidayHacker_advisorSeen';
  var SELECTED_BRIDGES_KEY = 'holidayHacker_selectedBridges';
  var DB_BASE       = '../database/holiday';
  var SC_JSON       = '../database/state-city/data.json';

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  var calSplit      = document.getElementById('calSplit');
  var splitTop      = document.getElementById('calSplitTop');
  var splitHandle   = document.getElementById('calSplitHandle');
  var splitBottom   = document.getElementById('calSplitBottom');
  var advisorMsgs   = document.getElementById('advisorMessages');

  var user, stateData = { states: [] };
  var workHolidays = [];
  var DELAY = 1000;
  var MAX_WAIT = 3000;

  /* ─── Data helpers ─────────────────────────────────── */

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

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  /* ─── Weekly off logic (all bridge/gift/mega use isWeekOff) ─────────────
   * Future: custom pattern via user.customOffDays = [0,1,6] (Sun,Mon,Sat). */

  function getWeekOffDays() {
    var pref = user.weeklyOff || 'sat-sun';
    if (pref === 'sun-only')    return [0];
    if (pref === 'sat-sun')     return [6, 0];
    if (pref === '2nd-4th-sat') return [0];
    if (pref === 'custom' && Array.isArray(user.customOffDays)) return user.customOffDays;
    return [6, 0];
  }

  function is2nd4thSat(dateObj) {
    if (dateObj.getDay() !== 6) return false;
    var week = Math.ceil(dateObj.getDate() / 7);
    return week === 2 || week === 4;
  }

  function isWeekOff(dateObj) {
    var jsDay = dateObj.getDay();
    var offDays = getWeekOffDays();
    if (offDays.indexOf(jsDay) !== -1) return true;
    if (user.weeklyOff === '2nd-4th-sat' && is2nd4thSat(dateObj)) return true;
    return false;
  }

  /* ─── Date helpers ─────────────────────────────────── */

  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function toISO(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function formatRange(start, end) {
    var s = new Date(start + 'T00:00:00');
    var e = new Date(end + 'T00:00:00');
    var sm = MONTHS[s.getMonth()].slice(0, 3);
    var em = MONTHS[e.getMonth()].slice(0, 3);
    if (sm === em) return sm + ' ' + s.getDate() + ' – ' + e.getDate();
    return sm + ' ' + s.getDate() + ' – ' + em + ' ' + e.getDate();
  }

  function dayLabel(iso) {
    var d = new Date(iso + 'T00:00:00');
    return DAYS_SHORT[d.getDay()] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  }

  /* ─── Analysis: build holiday set for the year ────── */

  function buildWorkHolidaySet(holidays) {
    var ov = getOverrides();
    var set = {};
    holidays.filter(function (h) { return h.type === 'gazetted'; }).forEach(function (h) {
      var patch = ov[h.date];
      var date = patch ? (patch.date || h.date) : h.date;
      var name = patch ? (patch.name || h.name) : h.name;
      set[date] = name;
    });
    return set;
  }

  /* ─── Gift Weekends (Free holidays): natural 3-day breaks, 0 leaves ── */

  function findGiftWeekends(holidaySet) {
    var now = new Date();
    var results = [];
    var checked = {};

    Object.keys(holidaySet).sort().forEach(function (iso) {
      if (checked[iso]) return;
      var d = new Date(iso + 'T00:00:00');
      if (d < now) return;

      var streak = [];
      var cur = new Date(d);
      var prev = addDays(cur, -1);
      while (isWeekOff(prev) || holidaySet[toISO(prev)]) {
        cur = prev;
        prev = addDays(cur, -1);
        if (toISO(cur).slice(0, 4) !== String(now.getFullYear())) break;
      }
      var walk = new Date(cur);
      while (isWeekOff(walk) || holidaySet[toISO(walk)]) {
        streak.push(toISO(walk));
        walk = addDays(walk, 1);
        if (streak.length > 10) break;
      }

      if (streak.length >= 3) {
        var allFree = streak.every(function (s) {
          return isWeekOff(new Date(s + 'T00:00:00')) || !!holidaySet[s];
        });
        if (allFree) {
          var hName = holidaySet[iso] || 'Weekend';
          results.push({
            name: hName + ' Weekend',
            start: streak[0],
            end: streak[streak.length - 1],
            days: streak.length,
            leaves: 0,
            _dates: streak
          });
          streak.forEach(function (s) { checked[s] = true; });
        }
      }
    });

    return results;
  }

  /* ─── Golden Bridges: 1-2 leaves unlock 3+ day breaks ─ */

  function findGoldenBridges(holidaySet) {
    var now = new Date();
    var results = [];
    var used = {};

    Object.keys(holidaySet).sort().forEach(function (iso) {
      if (used[iso]) return;
      var d = new Date(iso + 'T00:00:00');
      if (d < now) return;

      for (var gap = 1; gap <= 2; gap++) {
        var bridgeAfter = tryBridge(d, gap, 1, holidaySet);
        if (bridgeAfter && !used[iso]) {
          results.push(bridgeAfter);
          bridgeAfter._dates.forEach(function (s) { used[s] = true; });
        }
        var bridgeBefore = tryBridge(d, gap, -1, holidaySet);
        if (bridgeBefore && !used[iso]) {
          results.push(bridgeBefore);
          bridgeBefore._dates.forEach(function (s) { used[s] = true; });
        }
      }
    });

    return results;
  }

  function tryBridge(holidayDate, gapSize, direction, holidaySet) {
    var iso = toISO(holidayDate);
    var streak = [iso];
    var leaveDays = [];

    for (var g = 1; g <= gapSize; g++) {
      var gd = addDays(holidayDate, g * direction);
      var gi = toISO(gd);
      if (holidaySet[gi] || isWeekOff(gd)) {
        streak.push(gi);
      } else {
        leaveDays.push(gi);
        streak.push(gi);
      }
    }

    var beyond = addDays(holidayDate, (gapSize + 1) * direction);
    if (!isWeekOff(beyond) && !holidaySet[toISO(beyond)]) return null;

    while (isWeekOff(beyond) || holidaySet[toISO(beyond)]) {
      streak.push(toISO(beyond));
      beyond = addDays(beyond, direction);
      if (streak.length > 10) break;
    }

    var back = addDays(holidayDate, -direction);
    while (isWeekOff(back) || holidaySet[toISO(back)]) {
      streak.push(toISO(back));
      back = addDays(back, -direction);
      if (streak.length > 10) break;
    }

    if (leaveDays.length === 0 || leaveDays.length > 2) return null;

    streak.sort();
    leaveDays.sort();
    var totalDays = streak.length;
    if (totalDays < 3) return null;

    var name = holidaySet[iso] || 'Holiday';
    return {
      name: name + ' Bridge',
      start: streak[0],
      end: streak[streak.length - 1],
      days: totalDays,
      leaves: leaveDays.length,
      leaveDays: leaveDays,
      _dates: streak
    };
  }

  /* ─── Mega-Bridge: off-to-off span, 2+ holidays in week, 2-5 leaves ─
   * Uses user's actual weekly off. Leave count = ALL work days in span
   * (includes e.g. 1st/3rd Sat for 2nd-4th-sat). Supports sat-sun, 2nd-4th-sat,
   * sun-only (8-day Sun-to-Sun), and custom (from each off-day). */

  function getMegaStartDatesAndSpan(year) {
    var pref = user.weeklyOff || 'sat-sun';
    var out = { starts: [], spanDays: 9 };

    if (pref === 'sat-sun') {
      out.spanDays = 9;
      for (var m = 0; m < 12; m++) {
        var firstSat = new Date(year, m, 1);
        var dow = firstSat.getDay();
        var satOffset = dow === 6 ? 0 : (6 - dow + 7) % 7;
        firstSat.setDate(1 + satOffset);
        while (firstSat.getMonth() === m && firstSat.getFullYear() === year) {
          out.starts.push(new Date(firstSat));
          firstSat.setDate(firstSat.getDate() + 7);
        }
      }
    } else if (pref === '2nd-4th-sat') {
      out.spanDays = 9;
      for (var m = 0; m < 12; m++) {
        var firstSat = new Date(year, m, 1);
        var dow = firstSat.getDay();
        var satOffset = dow === 6 ? 0 : (6 - dow + 7) % 7;
        firstSat.setDate(1 + satOffset);
        var weekNum = 1;
        while (firstSat.getMonth() === m && firstSat.getFullYear() === year) {
          if (weekNum === 2 || weekNum === 4) out.starts.push(new Date(firstSat));
          firstSat.setDate(firstSat.getDate() + 7);
          weekNum++;
        }
      }
    } else if (pref === 'sun-only') {
      out.spanDays = 8;
      for (var m = 0; m < 12; m++) {
        var firstSun = new Date(year, m, 1);
        var dow = firstSun.getDay();
        var sunOffset = dow === 0 ? 0 : (7 - dow) % 7;
        firstSun.setDate(1 + sunOffset);
        while (firstSun.getMonth() === m && firstSun.getFullYear() === year) {
          out.starts.push(new Date(firstSun));
          firstSun.setDate(firstSun.getDate() + 7);
        }
      }
    } else if (pref === 'custom' && Array.isArray(user.customOffDays) && user.customOffDays.length) {
      out.spanDays = 9;
      var offDays = user.customOffDays;
      for (var m = 0; m < 12; m++) {
        for (var d = 1; d <= 31; d++) {
          var dt = new Date(year, m, d);
          if (dt.getMonth() !== m) continue;
          if (offDays.indexOf(dt.getDay()) !== -1) out.starts.push(new Date(dt));
        }
      }
    }

    return out;
  }

  function findMegaBridges(holidaySet) {
    var pref = user.weeklyOff || 'sat-sun';
    var cfg = getMegaStartDatesAndSpan(new Date().getFullYear());
    if (!cfg.starts.length) return [];

    var spanDays = cfg.spanDays;
    var now = new Date();
    var year = now.getFullYear();
    var results = [];
    var usedDates = {};

    cfg.starts.forEach(function (startSat) {
      if (startSat < now) return;
      if (!isWeekOff(startSat)) return;

      var mon = addDays(startSat, 2);
      var fri = addDays(startSat, 6);
      var holidaysInWeek = 0;
      for (var d = new Date(mon); d <= fri; d = addDays(d, 1)) {
        if (holidaySet[toISO(d)]) holidaysInWeek++;
      }

      if (holidaysInWeek < 2) return;

      /* Leave days = ALL days in span that are work (not holiday, not week-off).
       * For 2nd-4th sat, Sat at index 7 may be work if not 2nd/4th. */
      var streak = [];
      var leaveDays = [];
      for (var i = 0; i < spanDays; i++) {
        var dayDate = addDays(startSat, i);
        var wi = toISO(dayDate);
        streak.push(wi);
        if (!holidaySet[wi] && !isWeekOff(dayDate)) leaveDays.push(wi);
      }

      if (leaveDays.length < 2 || leaveDays.length > 4) return;

      if (streak.some(function (iso) { return usedDates[iso]; })) return;

      if (!isWeekOff(addDays(startSat, spanDays - 1))) return;

      var holSet = {};
      streak.forEach(function (iso) {
        if (holidaySet[iso]) holSet[iso] = true;
      });

      results.push({
        name: spanDays === 9 ? 'Mega-Bridge' : 'Long Bridge',
        start: streak[0],
        end: streak[spanDays - 1],
        days: spanDays,
        leaves: leaveDays.length,
        leaveDays: leaveDays,
        _dates: streak,
        _holidaySet: holSet
      });

      streak.forEach(function (iso) { usedDates[iso] = true; });
    });

    return results;
  }

  window.startCalendarAdvisor = startAdvisor;

  function buildMegaPatternDisplay(mega) {
    var leaveSet = {};
    mega.leaveDays.forEach(function (iso) { leaveSet[iso] = true; });
    var holSet = mega._holidaySet || {};
    var parts = [];
    mega._dates.forEach(function (iso) {
      var d = new Date(iso + 'T00:00:00');
      var dayName = DAYS_SHORT[d.getDay()].slice(0, 2);
      if (leaveSet[iso]) parts.push('<span class="mega-bar-seg mega-bar-seg--leave">L</span>');
      else if (holSet[iso]) parts.push('<span class="mega-bar-seg mega-bar-seg--hol">HOL</span>');
      else parts.push('<span class="mega-bar-seg mega-bar-seg--off">' + dayName + '</span>');
    });
    return parts.join('');
  }

  function dedupeOverlappingBridges(bridges) {
    bridges.sort(function (a, b) { return b.days - a.days; });
    var kept = [];
    var usedDates = {};
    bridges.forEach(function (b) {
      var overlap = b._dates.some(function (iso) { return usedDates[iso]; });
      if (overlap) return;
      kept.push(b);
      b._dates.forEach(function (iso) { usedDates[iso] = true; });
    });
    return kept;
  }

  /* ─── Chat UI helpers ──────────────────────────────── */

  function scrollBottom() {
    requestAnimationFrame(function () {
      splitBottom.scrollTop = splitBottom.scrollHeight;
    });
  }

  function addBotMsg(html, cb) {
    var typing = document.createElement('div');
    typing.className = 'advisor-row';
    typing.innerHTML =
      '<div class="advisor-avatar"><span class="material-symbols-outlined">smart_toy</span></div>' +
      '<div class="advisor-bubble">' +
        '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>' +
      '</div>';
    advisorMsgs.appendChild(typing);
    scrollBottom();

    var delay = Math.max(600, Math.min(html.length * 5, 1400));
    setTimeout(function () {
      typing.remove();
      var row = document.createElement('div');
      row.className = 'advisor-row';
      row.innerHTML =
        '<div class="advisor-avatar"><span class="material-symbols-outlined">smart_toy</span></div>' +
        '<div class="advisor-bubble">' + html + '</div>';
      advisorMsgs.appendChild(row);
      scrollBottom();
      if (cb) setTimeout(cb, 1000);
    }, delay);
  }

  function addCard(cardHTML) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = cardHTML;
    var card = wrapper.firstElementChild;
    card.className += ' advisor-card';
    advisorMsgs.appendChild(card);
    scrollBottom();
  }

  function buildGiftCard(g) {
    return '<div class="advisor-card advisor-card--gift">' +
      '<div class="advisor-card-header">' +
        '<h4 class="advisor-card-title">' + g.name + '</h4>' +
        '<span class="advisor-card-badge advisor-card-badge--gift">0 Leaves / ' + g.days + ' Days</span>' +
      '</div>' +
      '<p class="advisor-card-date">' + formatRange(g.start, g.end) + '</p>' +
      '<div class="advisor-card-footer">' +
        '<span class="advisor-card-logic">Free — no leaves needed</span>' +
        '<span style="font-size:0.65rem;color:#dc2626;font-weight:600;">✓ Free</span>' +
      '</div>' +
    '</div>';
  }

  function formatLeaveLabel(iso) {
    var d = new Date(iso + 'T00:00:00');
    var dayName = DAYS_SHORT[d.getDay()];
    var rest = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
    return '<span class="leave-day-name">' + dayName + '</span> ' + rest;
  }

  function buildBridgeCard(b, idx) {
    var leaveLabels = b.leaveDays.map(function (iso) { return formatLeaveLabel(iso); });
    var leaveStr = 'Leave on: ' + leaveLabels.join(' &amp; ');
    var sel = getSelectedBridges().indexOf(b.start) !== -1;

    return '<div class="advisor-card advisor-card--bridge" data-bridge-start="' + b.start + '" data-bridge-leaves="' + b.leaves + '">' +
      '<div class="advisor-card-header">' +
        '<h4 class="advisor-card-title">' + b.name + '</h4>' +
        '<span class="advisor-card-badge advisor-card-badge--bridge">' + b.leaves + ' Leave' + (b.leaves > 1 ? 's' : '') + ' / ' + b.days + ' Days</span>' +
      '</div>' +
      '<p class="advisor-card-date">' + formatRange(b.start, b.end) + '</p>' +
      '<div class="advisor-card-footer">' +
        '<span class="advisor-card-logic">' + leaveStr + '</span>' +
        '<div class="advisor-toggle-wrap">' +
          '<span>Bridge it?</span>' +
          '<button type="button" class="advisor-toggle' + (sel ? ' is-on' : '') + '" aria-label="Toggle bridge"></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ─── Conversation flow ────────────────────────────── */

  function runConversation(gifts, bridges, megas) {
    var name = user.name || 'there';
    var year = new Date().getFullYear();
    var pending = user.pendingLeaves || 0;
    var totalGiftDays = gifts.reduce(function (s, g) { return s + g.days; }, 0);
    var totalBridgeDays = bridges.reduce(function (s, b) { return s + b.days; }, 0);
    var totalMegaDays = (megas || []).reduce(function (s, m) { return s + m.days; }, 0);
    var totalDays = totalGiftDays + totalBridgeDays + totalMegaDays;

    var megaCount = (megas || []).length;
    var parts = [];
    if (gifts.length) parts.push('<strong>' + gifts.length + ' Free Holiday' + (gifts.length !== 1 ? 's' : '') + '</strong>');
    if (bridges.length) parts.push('<strong>' + bridges.length + ' Golden Bridge' + (bridges.length !== 1 ? 's' : '') + '</strong>');
    if (megaCount) parts.push('<strong>' + megaCount + ' Mega-Bridge' + (megaCount !== 1 ? 's' : '') + '</strong>');
    var gotStr = parts.length ? 'You\'ve got ' + parts.join(', ') + '.' : 'Let\'s see what we found.';
    var msg1 =
      '<p>Okay, <strong>' + name + '</strong>, I\'ve mapped out your ' + year + '! ' + gotStr + '</p>' +
      '<p class="advisor-legend advisor-legend--free">🎁 Free Holidays: Natural 3-day breaks. No leaves needed.</p>' +
      '<p class="advisor-legend advisor-legend--bridge">🌉 Golden Bridges: 4-day (or more) breaks created by taking 1 or 2 strategic leaves.</p>';
    if (megaCount) {
      msg1 += '<p class="advisor-legend advisor-legend--mega">🏆 Mega-Bridges: 8–9 days off in a row. When 2+ holidays fall in a week, take 2–4 leaves to bridge them (based on your weekly off).</p>';
    }

    addBotMsg(msg1, function () {
      var msg2 = '<p>If we unlock all of them, you\'ll turn your <strong>' + pending +
        ' pending leaves</strong> into a massive <strong>' + totalDays +
        ' days</strong> of time off this year. Let\'s review!</p>';
      addBotMsg(msg2, function () {
        if (gifts.length) {
          addBotMsg('<p>Here are your <strong class="advisor-legend advisor-legend--free">Free Holidays</strong> — 3+ day breaks that cost 0 leaves.</p>', function () {
            gifts.forEach(function (g, i) {
              setTimeout(function () { addCard(buildGiftCard(g)); }, i * 300);
            });
            setTimeout(function () { showMegasThenBridges(megas || [], bridges); }, gifts.length * 300 + 500);
          });
        } else {
          showMegasThenBridges(megas || [], bridges);
        }
      });
    });
  }

  function showMegasThenBridges(megas, bridges) {
    if (megas && megas.length) {
      var monthLabels = [];
      megas.forEach(function (m) {
        var s = new Date(m.start + 'T00:00:00');
        monthLabels.push(MONTHS[s.getMonth()]);
      });
      var monthStr = monthLabels.length === 1 ? monthLabels[0] : monthLabels.slice(0, -1).join(', ') + ' and ' + monthLabels[monthLabels.length - 1];
      addBotMsg('<p>Wait... I\'ve found something special for <strong>' + monthStr + '</strong>! 🤯</p>', function () {
        var m0 = megas[0];
        addBotMsg('<p>By using <strong>' + m0.leaves + ' leave' + (m0.leaves > 1 ? 's' : '') + '</strong>, you can trigger a Mega-Bridge — <strong>' + m0.days + ' days</strong> in a row off, based on your weekly off pattern.</p>', function () {
          megas.forEach(function (m, i) {
            setTimeout(function () { addCard(buildMegaCard(m)); }, i * 400);
          });
          setTimeout(function () { showBridges(bridges, megas); }, megas.length * 400 + 500);
        });
      });
    } else {
      showBridges(bridges);
    }
  }

  function buildMegaCard(m) {
    var leaveLabels = m.leaveDays.map(function (iso) { return formatLeaveLabel(iso); });
    var leaveStr = 'Leave on: ' + leaveLabels.join(' &amp; ');
    var barHtml = buildMegaPatternDisplay(m);
    var title = m.days === 9 ? '9-Day Mega-Bridge' : (m.days + '-Day Long Bridge');
    var sel = getSelectedBridges().indexOf(m.start) !== -1;

    return '<div class="advisor-card advisor-card--mega" data-bridge-start="' + m.start + '" data-bridge-leaves="' + m.leaves + '">' +
      '<div class="advisor-card-header">' +
        '<h4 class="advisor-card-title">' + title + '</h4>' +
        '<span class="advisor-card-badge advisor-card-badge--mega">' + m.leaves + ' Leave' + (m.leaves > 1 ? 's' : '') + ' / ' + m.days + ' Days</span>' +
      '</div>' +
      '<p class="advisor-card-date">' + formatRange(m.start, m.end) + '</p>' +
      '<div class="advisor-card-mega-bar">' + barHtml + '</div>' +
      '<p class="advisor-card-mega-roi">' + m.leaves + ' Leaves spent = ' + m.days + ' Days gained.</p>' +
      '<div class="advisor-card-footer">' +
        '<span class="advisor-card-logic">' + leaveStr + '</span>' +
        '<div class="advisor-toggle-wrap">' +
          '<span>Bridge it?</span>' +
          '<button type="button" class="advisor-toggle advisor-toggle--mega' + (sel ? ' is-on' : '') + '" aria-label="Toggle mega bridge"></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function showBridges(bridges, megas) {
    megas = megas || [];
    if (!bridges.length && !megas.length) {
      addBotMsg('<p>No Golden Bridges found this year — but you can still tap any weekend on the calendar to manually bridge it!</p>', function () {
        setTimeout(showPassportNav, 1000);
      });
      return;
    }
    if (!bridges.length) {
      addBotMsg('<p>Still have leaves left? Swipe through the calendar months to discover more opportunities!</p>');
      wireToggles(bridges, megas);
      setTimeout(showPassportNav, 1000);
      return;
    }
    addBotMsg('<p>These are the <strong class="advisor-legend advisor-legend--bridge">Golden Bridges</strong>. A tiny investment of 1–2 leaves unlocks a longer vacation.</p>', function () {
      bridges.forEach(function (b, i) {
        setTimeout(function () { addCard(buildBridgeCard(b, i)); }, i * 300);
      });
      setTimeout(function () {
        addBotMsg('<p>Still have leaves left? Swipe through the calendar months to discover more opportunities!</p>');
        wireToggles(bridges, megas);
        setTimeout(showPassportNav, 1000);
      }, bridges.length * 300 + 500);
    });
  }

  function showPassportNav() {
    if (document.getElementById('advisorNavBlock')) return;
    localStorage.setItem(ADVISOR_SEEN_KEY, '1');
    var block = document.createElement('div');
    block.id = 'advisorNavBlock';
    block.className = 'advisor-row';
    block.innerHTML =
      '<div class="advisor-avatar"><span class="material-symbols-outlined">smart_toy</span></div>' +
      '<div class="advisor-bubble advisor-bubble--nav">' +
        '<p>Ready to plan your trips? Head to <strong>Trips</strong> for location suggestions and travel options.</p>' +
        '<a href="../trips/index.html" class="advisor-nav-btn">Go to Trips</a>' +
      '</div>';
    advisorMsgs.appendChild(block);
    scrollBottom();
  }

  function hidePassportNav() {
    var el = document.getElementById('advisorNavBlock');
    if (el) el.remove();
  }

  function showLeaveOverWarning() {
    var existing = document.getElementById('advisorLeaveWarning');
    if (existing) existing.remove();
    var row = document.createElement('div');
    row.id = 'advisorLeaveWarning';
    row.className = 'advisor-row advisor-row--warning';
    row.innerHTML =
      '<div class="advisor-avatar"><span class="material-symbols-outlined">smart_toy</span></div>' +
      '<div class="advisor-bubble advisor-bubble--warning">' +
        '<p>You\'ve selected more bridges than your pending leaves allow. Your leave budget for the year is over.</p>' +
      '</div>';
    advisorMsgs.appendChild(row);
    scrollBottom();
  }

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
    window.dispatchEvent(new CustomEvent('bridgeSelectionChange'));
  }

  function syncAdvisorToggles() {
    var sel = getSelectedBridges();
    advisorMsgs.querySelectorAll('.advisor-card--bridge .advisor-toggle, .advisor-card--mega .advisor-toggle').forEach(function (btn) {
      var card = btn.closest('.advisor-card--bridge, .advisor-card--mega');
      var start = card ? card.getAttribute('data-bridge-start') : null;
      if (start) {
        if (sel.indexOf(start) !== -1) btn.classList.add('is-on');
        else btn.classList.remove('is-on');
      }
    });
  }

  window.addEventListener('bridgeSelectionChange', syncAdvisorToggles);

  function wireToggles(bridges, megas) {
    var pending = parseInt(user.pendingLeaves, 10) || 0;
    var toggles = advisorMsgs.querySelectorAll('.advisor-card--bridge .advisor-toggle, .advisor-card--mega .advisor-toggle');

    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.advisor-card--bridge, .advisor-card--mega');
        var start = card ? card.getAttribute('data-bridge-start') : null;
        btn.classList.toggle('is-on');
        if (start) setSelectedBridge(start, btn.classList.contains('is-on'));

        var total = 0;
        toggles.forEach(function (t) {
          if (t.classList.contains('is-on')) {
            var c = t.closest('.advisor-card--bridge, .advisor-card--mega');
            if (c) total += parseInt(c.getAttribute('data-bridge-leaves') || '0', 10);
          }
        });

        if (total > pending) {
          hidePassportNav();
          showLeaveOverWarning();
          setTimeout(showPassportNav, 1500);
        }
      });
    });
  }

  /* ─── Split panel activation ───────────────────────── */

  function activateSplit() {
    var navH = 64;
    var pageH = calSplit.parentElement.clientHeight - navH;
    var topH = Math.round(pageH * 0.48);

    calSplit.classList.add('cal-split--active');
    splitTop.style.height = topH + 'px';

    setupDragHandle(pageH);
  }

  function setupDragHandle(pageH) {
    var startY, startH;
    var handleH = splitHandle.offsetHeight;
    var minTop = 120;
    var maxTop = pageH - 150 - handleH;

    function onMove(clientY) {
      var delta = clientY - startY;
      var newH = Math.max(minTop, Math.min(maxTop, startH + delta));
      splitTop.style.height = newH + 'px';
    }

    splitHandle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startY = e.clientY;
      startH = splitTop.offsetHeight;
      function mm(ev) { onMove(ev.clientY); }
      function mu() { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });

    splitHandle.addEventListener('touchstart', function (e) {
      startY = e.touches[0].clientY;
      startH = splitTop.offsetHeight;
      function tm(ev) { ev.preventDefault(); onMove(ev.touches[0].clientY); }
      function te() { document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); }
      document.addEventListener('touchmove', tm, { passive: false });
      document.addEventListener('touchend', te);
    }, { passive: true });
  }

  /* ─── Init ─────────────────────────────────────────── */

  function startAdvisor() {
    if (!localStorage.getItem(CAL_DONE_KEY)) return;
    user = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!user.workLocation) return;

    var advisorRan = false;
    function runOnce() {
      if (advisorRan) return;
      advisorRan = true;
      scheduleAdvisor();
    }

    setTimeout(runOnce, MAX_WAIT);

    fetch(SC_JSON)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        stateData = d;
        var workCode = stateCodeFromLocation(user.workLocation);
        if (workCode) {
          var year = new Date().getFullYear();
          fetchHolidays(workCode, year).then(function (holidays) {
            workHolidays = holidays;
            runOnce();
          }).catch(runOnce);
        } else {
          runOnce();
        }
      })
      .catch(runOnce);
  }

  function scheduleAdvisor() {
    setTimeout(function () {
      var holidaySet = buildWorkHolidaySet(workHolidays);
      var gifts   = findGiftWeekends(holidaySet);
      var bridges = findGoldenBridges(holidaySet);
      var megas   = findMegaBridges(holidaySet);

      var giftDates = {};
      gifts.forEach(function (g) {
        var s = new Date(g.start + 'T00:00:00');
        var e = new Date(g.end + 'T00:00:00');
        while (s <= e) { giftDates[toISO(s)] = true; s = addDays(s, 1); }
      });
      bridges = bridges.filter(function (b) { return !giftDates[b.start]; });

      var megaDates = {};
      megas.forEach(function (m) {
        m._dates.forEach(function (iso) { megaDates[iso] = true; });
      });
      bridges = bridges.filter(function (b) {
        return !b._dates.some(function (iso) { return megaDates[iso]; });
      });

      window._advisorBridgesAll = bridges.slice();
      window._advisorMegaBridges = megas;
      window._advisorGifts = gifts;
      bridges = dedupeOverlappingBridges(bridges);
      window._advisorBridges = bridges;

      try {
        localStorage.setItem('holidayHacker_advisorData', JSON.stringify({
          gifts: gifts,
          bridges: window._advisorBridges,
          bridgesAll: window._advisorBridgesAll,
          megas: megas
        }));
      } catch (e) {}

      if (typeof window.refreshCalendarBreaks === 'function') {
        window.refreshCalendarBreaks();
      }

      if (localStorage.getItem(ADVISOR_SEEN_KEY)) {
        calSplit.classList.add('cal-split--seen');
      } else {
        activateSplit();
        setTimeout(function () { runConversation(gifts, bridges, megas); }, 600);
      }
    }, DELAY);
  }

})();
