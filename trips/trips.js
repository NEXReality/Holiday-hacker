/* Trips: confirmed trips from Plan + leaves saved logic */
(function () {
  'use strict';

  var CONFIRMED_TRIPS_KEY = 'holidayHacker_confirmedTrips';
  var ADVISOR_DATA_KEY    = 'holidayHacker_advisorData';
  var SELECTED_BRIDGES_KEY = 'holidayHacker_selectedBridges';
  var PLANNED_TRIPS_KEY   = 'holidayHacker_plannedTrips';
  var FAVORITES_KEY       = 'holidayHacker_favorites';
  var TRIP_SETTINGS_KEY   = 'holidayHacker_tripSettings';
  var HOMETOWN_IMAGE_URL  = 'https://img.freepik.com/free-vector/suburban-house-illustration_33099-2357.jpg';
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function getTripSettings() {
    try { return JSON.parse(localStorage.getItem(TRIP_SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveTripSettings(settings) {
    localStorage.setItem(TRIP_SETTINGS_KEY, JSON.stringify(settings));
  }
  function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveFavorites(favs) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  }
  function isFavorite(windowStart) {
    return getFavorites().some(function (f) { return f.windowStart === windowStart; });
  }

  function getConfirmedTrips() {
    try {
      return JSON.parse(localStorage.getItem(CONFIRMED_TRIPS_KEY) || '[]');
    } catch (e) { return []; }
  }

  function getActiveWindowStarts() {
    var data, selected, planned;
    try { data = JSON.parse(localStorage.getItem(ADVISOR_DATA_KEY) || '{}'); } catch (e) { data = {}; }
    try { selected = JSON.parse(localStorage.getItem(SELECTED_BRIDGES_KEY) || '[]'); } catch (e) { selected = []; }
    try { planned = JSON.parse(localStorage.getItem(PLANNED_TRIPS_KEY) || '[]'); } catch (e) { planned = []; }

    var active = {};
    (data.gifts || []).forEach(function (g) {
      if (planned.indexOf(g.start) !== -1) active[g.start] = true;
    });
    (data.bridges || []).forEach(function (b) {
      if (selected.indexOf(b.start) !== -1) active[b.start] = true;
    });
    (data.megas || []).forEach(function (m) {
      if (selected.indexOf(m.start) !== -1) active[m.start] = true;
    });
    return active;
  }

  function syncConfirmedTrips() {
    var trips = getConfirmedTrips();
    if (!trips.length) return trips;
    var active = getActiveWindowStarts();
    var cleaned = trips.filter(function (t) { return !!active[t.windowStart]; });
    if (cleaned.length !== trips.length) {
      localStorage.setItem(CONFIRMED_TRIPS_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  }

  function formatRange(start, end) {
    var s = new Date(start + 'T00:00:00');
    var e = new Date(end + 'T00:00:00');
    return MONTHS[s.getMonth()] + ' ' + s.getDate() + ' - ' + MONTHS[e.getMonth()] + ' ' + e.getDate();
  }

  function countWeekdays(startStr, endStr) {
    var start = new Date(startStr + 'T00:00:00');
    var end = new Date(endStr + 'T00:00:00');
    var count = 0;
    var d = new Date(start);
    while (d <= end) {
      var day = d.getDay();
      if (day >= 1 && day <= 5) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  function computeLeavesSaved(trip) {
    var weekdays = countWeekdays(trip.windowStart, trip.windowEnd);
    var leavesUsed = trip.leaves || 0;
    return Math.max(0, weekdays - leavesUsed);
  }

  function getTravelModes() {
    try {
      var p = JSON.parse(localStorage.getItem('holidayHacker_travelPreferences') || '{}');
      var modes = p.travelModes || (p.travelMode ? [p.travelMode] : null) || ['car'];
      return Array.isArray(modes) && modes.length ? modes : ['car'];
    } catch (e) { return ['car']; }
  }

  var MODE_ICONS = { flight: 'flight', train: 'train', bus: 'directions_bus', car: 'directions_car' };

  function getTrainText(windowStart) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var start = new Date((windowStart || '') + 'T00:00:00');
    var diff = Math.ceil((start - today) / (24 * 60 * 60 * 1000));
    return diff < 60 ? 'Booking already started — check availability' : 'Booking opens 60 days prior @ 8:00 AM';
  }

  function populate() {
    var container = document.getElementById('tripsHacks');
    var trips = syncConfirmedTrips();
    var totalLeavesSaved = 0;
    trips.forEach(function (t) {
      totalLeavesSaved += computeLeavesSaved(t);
    });

    var statHero = document.querySelector('.passport-stat-hero h2');
    if (statHero) statHero.innerHTML = totalLeavesSaved + ' <span>Days</span>';

    var confirmedEl = document.querySelector('.passport-stat-card--confirmed h3');
    if (confirmedEl) confirmedEl.textContent = trips.length;

    var plannedCount = 0;
    try {
      trips.forEach(function (t) {
        var totalDays = t.windowDays || 0;
        var leavesUsed = t.leaves || 0;
        plannedCount += Math.max(0, totalDays - leavesUsed);
      });
    } catch (e) {}
    var holidaysEl = document.querySelector('.passport-stat-card--holidays h3');
    if (holidaysEl) holidaysEl.textContent = plannedCount;

    /* Dynamic benchmark text based on holiday utilization */
    var beatTextEl = document.querySelector('.passport-stat-hero-footer span:last-child');
    try {
      var advisorData = JSON.parse(localStorage.getItem(ADVISOR_DATA_KEY) || '{}');
      var possibleHolidayDays = 0;
      (advisorData.gifts || []).forEach(function (g) { possibleHolidayDays += (g.days || 0); });
      (advisorData.bridges || []).forEach(function (b) { possibleHolidayDays += (b.days || 0); });
      (advisorData.megas || []).forEach(function (m) { possibleHolidayDays += (m.days || 0); });
      var utilizationPct = possibleHolidayDays > 0 ? Math.round((plannedCount / possibleHolidayDays) * 100) : 0;
      utilizationPct = Math.max(0, Math.min(100, utilizationPct));
      if (beatTextEl) beatTextEl.textContent = "You're beating " + utilizationPct + '% of hackers!';
    } catch (err) {}

    var travelModes = getTravelModes();
    var allSettings = getTripSettings();
    var html = '';
    trips.forEach(function (t, idx) {
      var d = t.destination || {};
      var isHometownTrip = d.slug === '__hometown__' || d.isHometown;
      var imgUrl = (d.imageUrl || '').trim();
      if (isHometownTrip && !imgUrl) imgUrl = HOMETOWN_IMAGE_URL;
      var imgCls = isHometownTrip ? ' trips-card-img--hometown' : '';
      var imgStyle = imgUrl
        ? 'background-image: url(\'' + imgUrl.replace(/'/g, "\\'") + '\')'
        : 'background-color: var(--gray-300)';
      var label = formatRange(t.windowStart, t.windowEnd);
      var leavesUsed = t.leaves || 0;
      var needsLeaveReminder = leavesUsed > 0;
      var typeLabel = t.windowType === 'golden' ? 'Golden Bridge' : (t.windowType === 'mega' ? 'Mega-Bridge' : 'Free Holiday');
      var badge = (t.windowName || typeLabel);
      var badgeCls = t.windowType === 'free' ? 'trips-card-badge--free' : (t.windowType === 'golden' ? 'trips-card-badge--golden' : 'trips-card-badge--mega');
      var meta = t.windowDays + 'D/' + (t.windowDays - 1) + 'N • ' + leavesUsed + ' Leave' + (leavesUsed !== 1 ? 's' : '') + ' used';
      var destName = (d.name || '').replace(/</g, '&lt;');
      var ts = allSettings[t.windowStart] || {};
      var savedDays = ts.reminderDays || 30;
      var savedTime = ts.reminderTime || '10:00';
      var tParts = savedTime.split(':');
      var tH = parseInt(tParts[0], 10) || 10;
      var tMM = (tParts[1] || '00').slice(0, 2);
      var tAmpm = tH < 12 ? 'AM' : 'PM';
      var tH12 = tH === 0 ? 12 : (tH > 12 ? tH - 12 : tH);
      var displayTime = tH12 + ':' + tMM + ' ' + tAmpm;
      var fav = isFavorite(t.windowStart);
      var favIcon = fav ? 'favorite' : 'favorite_border';
      var favCls = fav ? ' trips-card-action-btn--fav-active' : '';
      var leaveReminderHtml = needsLeaveReminder
        ? ('<div class="trips-card-leave-reminder">' +
            '<div class="trips-card-reminder-row">' +
              '<div class="trips-card-reminder-icon"><span class="material-symbols-outlined">event_note</span></div>' +
              '<div class="trips-card-reminder-display"><p class="trips-card-reminder-title">Leave Application</p><p class="trips-card-reminder-sub">' + savedDays + ' days before • ' + displayTime + '</p></div>' +
              '<button type="button" class="trips-card-reminder-edit" aria-label="Edit"><span class="material-symbols-outlined">edit</span></button>' +
              '<button type="button" class="trips-card-advisor-toggle is-on" aria-label="Toggle reminder"></button>' +
            '</div>' +
            '<div class="trips-card-edit-wrap" style="display:none">' +
              '<section class="edit-field"><label class="edit-field-label">Days before trip</label><input type="number" class="edit-field-input trips-edit-days" min="1" max="60" value="' + savedDays + '" placeholder="30"/></section>' +
              '<section class="edit-field"><label class="edit-field-label">Reminder time</label><input type="time" class="edit-field-input trips-edit-time" value="' + savedTime + '"/></section>' +
              '<button type="button" class="trips-card-edit-done">Done</button>' +
            '</div>' +
          '</div>')
        : '';
      html += '<div class="trips-card" data-idx="' + idx + '" data-window-start="' + t.windowStart + '">' +
        '<div class="trips-card-img-wrap">' +
          '<div class="trips-card-img' + imgCls + '" style="' + imgStyle + '"></div>' +
          '<div class="trips-card-overlay"></div>' +
          '<div class="trips-card-caption">' +
            '<span class="trips-card-badge ' + badgeCls + '">' + badge + '</span>' +
            '<h4 class="trips-card-title">' + destName + '</h4>' +
          '</div>' +
        '</div>' +
        '<div class="trips-card-body">' +
          '<div class="trips-card-meta">' +
            '<div class="trips-card-meta-left">' +
              '<span class="trips-card-date"><span class="material-symbols-outlined">date_range</span> ' + label + '</span>' +
              '<span class="trips-card-days">' + meta + '</span>' +
            '</div>' +
            '<label class="trips-card-reminders-toggle"><span class="trips-card-reminders-label">Reminders</span><span class="trips-card-switch"><input type="checkbox" class="trips-card-reminders-cb" checked/><span class="trips-card-switch-slider"></span></span></label>' +
          '</div>' +
          '<div class="trips-card-expand-row"><button type="button" class="trips-card-expand-btn" aria-label="Expand"><span class="material-symbols-outlined">expand_more</span></button></div>' +
          '<div class="trips-card-expanded">' +
            leaveReminderHtml +
            '<div class="trips-card-transport">' +
              '<p class="trips-card-transport-label">Transport Mode</p>' +
              '<div class="trips-card-transport-btns">' + (function () {
                var defaultMode = travelModes[0] || 'car';
                var icons = { flight: 'flight', train: 'train', bus: 'directions_bus', car: 'directions_car' };
                var btns = '';
                travelModes.forEach(function (m) {
                  var icon = icons[m] || MODE_ICONS[m] || m;
                  var active = m === defaultMode ? ' trips-card-transport-btn--active' : '';
                  btns += '<button type="button" class="trips-card-transport-btn' + active + '" data-mode="' + m + '"><span class="material-symbols-outlined">' + icon + '</span></button>';
                });
                return btns;
              })() + '</div>' +
              '<div class="trips-card-booking" data-mode="' + (travelModes[0] || 'car') + '">' +
                '<span class="material-symbols-outlined trips-card-booking-icon">' + (MODE_ICONS[travelModes[0]] || 'directions_car') + '</span>' +
                '<p class="trips-card-booking-text">' + (travelModes[0] === 'train' ? getTrainText(t.windowStart) : { flight: 'Remind me when prices drop', bus: 'Ideal booking 30 days prior @ 8:00 AM', car: 'Pre-departure checklist' }[travelModes[0]] || 'Pre-departure checklist') + '</p>' +
              '</div>' +
            '</div>' +
            '<div class="trips-card-actions">' +
              '<div class="trips-card-actions-grid">' +
                '<button type="button" class="trips-card-action-btn trips-card-view-details"><span class="material-symbols-outlined">info</span><span>View Details</span></button>' +
                '<button type="button" class="trips-card-action-btn trips-card-change-window"><span class="material-symbols-outlined">calendar_month</span><span>Change Window</span></button>' +
                '<button type="button" class="trips-card-action-btn trips-card-add-cal"><span class="material-symbols-outlined">calendar_add_on</span><span>Add to Calendar</span></button>' +
                '<button type="button" class="trips-card-action-btn trips-card-favorite' + favCls + '"><span class="material-symbols-outlined">' + favIcon + '</span><span>Favorite</span></button>' +
                '<button type="button" class="trips-card-action-btn trips-card-remove"><span class="material-symbols-outlined">delete_outline</span><span>Remove</span></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    });

    if (container) container.innerHTML = html;

    var emptyEl = document.querySelector('.passport-empty');
    if (emptyEl) emptyEl.style.display = trips.length ? 'none' : '';

    container.querySelectorAll('.trips-card').forEach(function (card) {
      var idx = parseInt(card.getAttribute('data-idx'), 10);
      var windowStart = card.getAttribute('data-window-start');
      var trip = trips[idx];
      var expandBtn = card.querySelector('.trips-card-expand-btn');
      var viewDetailsBtn = card.querySelector('.trips-card-view-details');
      var titleEl = card.querySelector('.trips-card-title');
      var imgWrap = card.querySelector('.trips-card-img-wrap');

      /* Expand/collapse */
      if (expandBtn) {
        expandBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          card.classList.toggle('trips-card--expanded');
          var icon = expandBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = card.classList.contains('trips-card--expanded') ? 'expand_less' : 'expand_more';
        });
      }

      /* View details */
      function openDetail() {
        if (!isNaN(idx) && trips[idx]) openTripDetail(trips[idx]);
      }
      if (viewDetailsBtn) viewDetailsBtn.addEventListener('click', function (e) { e.stopPropagation(); openDetail(); });
      if (titleEl) titleEl.addEventListener('click', function (e) { e.stopPropagation(); openDetail(); });
      if (imgWrap) imgWrap.addEventListener('click', function (e) { e.stopPropagation(); openDetail(); });

      /* Transport mode */
      var transportBtns = card.querySelectorAll('.trips-card-transport-btn');
      var bookingEl = card.querySelector('.trips-card-booking');
      function getModeContent(mode) {
        var icons = { flight: 'flight', train: 'train', bus: 'directions_bus', car: 'directions_car' };
        var texts = { flight: 'Remind me when prices drop', train: getTrainText(trip && trip.windowStart), bus: 'Ideal booking 30 days prior @ 8:00 AM', car: 'Pre-departure checklist' };
        return { icon: icons[mode] || MODE_ICONS[mode], text: texts[mode] || 'Pre-departure checklist' };
      }
      function setTransportActive(btn) {
        transportBtns.forEach(function (b) { b.classList.remove('trips-card-transport-btn--active'); });
        btn.classList.add('trips-card-transport-btn--active');
        var mode = btn.getAttribute('data-mode');
        var content = getModeContent(mode);
        if (bookingEl) {
          var iconEl = bookingEl.querySelector('.trips-card-booking-icon');
          var textEl = bookingEl.querySelector('.trips-card-booking-text');
          if (iconEl) iconEl.textContent = content.icon;
          if (textEl) textEl.textContent = content.text;
        }
        if (bookingEl) bookingEl.setAttribute('data-mode', mode);
      }
      transportBtns.forEach(function (btn) {
        btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); setTransportActive(btn); });
        btn.addEventListener('click', function (e) { e.stopPropagation(); setTransportActive(btn); });
      });

      /* Actions grid is always visible when card is expanded (no toggle needed) */

      /* Reminder edit + save to localStorage */
      var editBtn = card.querySelector('.trips-card-reminder-edit');
      var editWrap = card.querySelector('.trips-card-edit-wrap');
      var reminderDisplay = card.querySelector('.trips-card-reminder-display');
      var editDays = card.querySelector('.trips-edit-days');
      var editTime = card.querySelector('.trips-edit-time');
      var editDone = card.querySelector('.trips-card-edit-done');
      if (editBtn && editWrap) {
        editBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          editWrap.style.display = editWrap.style.display === 'none' ? 'block' : 'none';
        });
      }
      if (editDone && editWrap && reminderDisplay && editDays && editTime) {
        editDone.addEventListener('click', function (e) {
          e.stopPropagation();
          var sub = reminderDisplay.querySelector('.trips-card-reminder-sub');
          var tv = editTime.value || '10:00';
          var p = tv.split(':');
          var h = parseInt(p[0], 10) || 10;
          var m = (p[1] || '00').slice(0, 2);
          var ampm = h < 12 ? 'AM' : 'PM';
          var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
          var timeStr = h12 + ':' + m + ' ' + ampm;
          var dv = parseInt(editDays.value, 10) || 30;
          if (sub) sub.textContent = dv + ' days before • ' + timeStr;
          editWrap.style.display = 'none';
          var settings = getTripSettings();
          settings[windowStart] = { reminderDays: dv, reminderTime: tv };
          saveTripSettings(settings);
        });
      }

      /* Reminders toggle */
      var remindersCb = card.querySelector('.trips-card-reminders-cb');
      var advisorToggle = card.querySelector('.trips-card-advisor-toggle');
      var transportSection = card.querySelector('.trips-card-transport');
      function syncRemindersState() {
        var on = remindersCb && remindersCb.checked;
        if (advisorToggle) advisorToggle.classList.toggle('is-on', on);
        if (transportSection) transportSection.classList.toggle('trips-card-transport--muted', !on);
      }
      if (remindersCb) {
        remindersCb.addEventListener('change', syncRemindersState);
        syncRemindersState();
      }
      card.querySelectorAll('.trips-card-advisor-toggle').forEach(function (tgl) {
        tgl.addEventListener('click', function (e) {
          e.stopPropagation();
          if (remindersCb && !remindersCb.checked) return;
          tgl.classList.toggle('is-on');
        });
      });

      /* Favorite */
      var favBtn = card.querySelector('.trips-card-favorite');
      if (favBtn && trip) {
        favBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var favs = getFavorites();
          var existIdx = favs.findIndex(function (f) { return f.windowStart === windowStart; });
          if (existIdx >= 0) {
            favs.splice(existIdx, 1);
            favBtn.classList.remove('trips-card-action-btn--fav-active');
            favBtn.querySelector('.material-symbols-outlined').textContent = 'favorite_border';
          } else {
            favs.push({
              windowStart: trip.windowStart,
              windowEnd: trip.windowEnd,
              windowName: trip.windowName,
              windowType: trip.windowType,
              windowDays: trip.windowDays,
              leaves: trip.leaves,
              destination: trip.destination
            });
            favBtn.classList.add('trips-card-action-btn--fav-active');
            favBtn.querySelector('.material-symbols-outlined').textContent = 'favorite';
          }
          saveFavorites(favs);
        });
      }

      /* Change Window */
      var changeWindowBtn = card.querySelector('.trips-card-change-window');
      if (changeWindowBtn && trip) {
        changeWindowBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openChangeWindowPopup(trip, idx);
        });
      }

      /* Add to Calendar */
      var addCalBtn = card.querySelector('.trips-card-add-cal');
      if (addCalBtn && trip) {
        addCalBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          openCalendarSheet(trip, card);
        });
      }

      /* Remove */
      var removeBtn = card.querySelector('.trips-card-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('Remove this trip? The holiday window will remain available for a new destination.')) return;
          var allTrips = getConfirmedTrips();
          allTrips = allTrips.filter(function (t) { return t.windowStart !== windowStart; });
          localStorage.setItem(CONFIRMED_TRIPS_KEY, JSON.stringify(allTrips));
          populate();
        });
      }
    });
  }

  /* ─── Add to Calendar sheet ───────────────────────────── */

  function dateMinus(isoDate, days) {
    var d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() - days);
    return d;
  }

  function fmtDateShort(d) {
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  function toICSDate(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return String(y) + (m < 10 ? '0' : '') + m + (day < 10 ? '0' : '') + day;
  }

  function toICSDateTime(d, time) {
    var p = (time || '10:00').split(':');
    var h = (parseInt(p[0], 10) || 10);
    var m = (parseInt(p[1], 10) || 0);
    return toICSDate(d) + 'T' + (h < 10 ? '0' : '') + h + (m < 10 ? '0' : '') + m + '00';
  }

  function toGCalDate(d) {
    return toICSDate(d);
  }

  function toGCalDateTime(d, time) {
    return toICSDateTime(d, time);
  }

  function buildCalendarEvents(trip, card) {
    var dName = (trip.destination && trip.destination.name) || 'Trip';
    var winName = trip.windowName || 'Holiday';
    var rangeLabel = fmtDateShort(new Date(trip.windowStart + 'T00:00:00')) + '-' +
                     fmtDateShort(new Date(trip.windowEnd + 'T00:00:00'));
    var events = [];

    var endDate = new Date(trip.windowEnd + 'T00:00:00');
    endDate.setDate(endDate.getDate() + 1);
    events.push({
      id: 'trip',
      label: 'Trip: ' + dName + ' (' + rangeLabel + ')',
      summary: dName + ' - ' + winName,
      description: trip.windowDays + ' day trip to ' + dName,
      allDay: true,
      startDate: trip.windowStart,
      endDateExcl: endDate.toISOString().slice(0, 10)
    });

    var settings = getTripSettings();
    var ts = settings[trip.windowStart] || {};
    var reminderDays = ts.reminderDays || 30;
    var reminderTime = ts.reminderTime || '10:00';
    var remCb = card ? card.querySelector('.trips-card-reminders-cb') : null;
    var remOn = remCb ? remCb.checked : true;

    var tripLeaves = trip.leaves || 0;
    if (remOn && tripLeaves > 0) {
      var leaveDate = dateMinus(trip.windowStart, reminderDays);
      var p = reminderTime.split(':');
      var h = parseInt(p[0], 10) || 10;
      var mm = (p[1] || '00').slice(0, 2);
      var ampm = h < 12 ? 'AM' : 'PM';
      var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
      var timeLabel = h12 + ':' + mm + ' ' + ampm;
      events.push({
        id: 'leave',
        label: 'Apply Leave - ' + fmtDateShort(leaveDate) + ' at ' + timeLabel,
        summary: 'Apply Leave: ' + dName + ' trip (' + rangeLabel + ')',
        description: 'Submit leave application for your ' + dName + ' trip on ' + rangeLabel,
        allDay: false,
        dateObj: leaveDate,
        time: reminderTime
      });
    }

    var activeBtn = card ? card.querySelector('.trips-card-transport-btn--active') : null;
    var mode = activeBtn ? activeBtn.getAttribute('data-mode') : null;
    var bookingConfig = { train: { days: 60, time: '08:00', label: 'Book Train' },
                          bus:   { days: 30, time: '08:00', label: 'Book Bus' },
                          flight:{ days: 45, time: '10:00', label: 'Book Flight' } };
    var bc = mode ? bookingConfig[mode] : null;
    if (bc && remOn) {
      var bookDate = dateMinus(trip.windowStart, bc.days);
      var bp = bc.time.split(':');
      var bh = parseInt(bp[0], 10);
      var bmm = bp[1] || '00';
      var bampm = bh < 12 ? 'AM' : 'PM';
      var bh12 = bh === 0 ? 12 : (bh > 12 ? bh - 12 : bh);
      var bTimeLabel = bh12 + ':' + bmm + ' ' + bampm;
      events.push({
        id: 'booking',
        label: bc.label + ' - ' + fmtDateShort(bookDate) + ' at ' + bTimeLabel,
        summary: bc.label + ': ' + dName + ' trip (' + rangeLabel + ')',
        description: bc.label + ' for your ' + dName + ' trip on ' + rangeLabel,
        allDay: false,
        dateObj: bookDate,
        time: bc.time
      });
    }
    return events;
  }

  function buildGoogleCalURL(evt) {
    var base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    var text = '&text=' + encodeURIComponent(evt.summary);
    var dates;
    if (evt.allDay) {
      dates = '&dates=' + toGCalDate(new Date(evt.startDate + 'T00:00:00')) + '/' +
              toGCalDate(new Date(evt.endDateExcl + 'T00:00:00'));
    } else {
      var startDT = toGCalDateTime(evt.dateObj, evt.time);
      var endObj = new Date(evt.dateObj);
      endObj.setMinutes(endObj.getMinutes() + 30);
      var endDT = toGCalDateTime(endObj, evt.time.split(':')[0] + ':30');
      dates = '&dates=' + startDT + '/' + endDT;
    }
    var details = '&details=' + encodeURIComponent(evt.description || '');
    return base + text + dates + details;
  }

  function buildICSContent(events) {
    var ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//HolidayHacker//EN\r\n';
    events.forEach(function (evt) {
      ics += 'BEGIN:VEVENT\r\n';
      if (evt.allDay) {
        ics += 'DTSTART;VALUE=DATE:' + toICSDate(new Date(evt.startDate + 'T00:00:00')) + '\r\n';
        ics += 'DTEND;VALUE=DATE:' + toICSDate(new Date(evt.endDateExcl + 'T00:00:00')) + '\r\n';
      } else {
        ics += 'DTSTART:' + toICSDateTime(evt.dateObj, evt.time) + '\r\n';
        var endObj = new Date(evt.dateObj);
        endObj.setMinutes(endObj.getMinutes() + 30);
        ics += 'DTEND:' + toICSDateTime(endObj, evt.time.split(':')[0] + ':30') + '\r\n';
        ics += 'BEGIN:VALARM\r\nTRIGGER:-PT10M\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\n';
      }
      ics += 'SUMMARY:' + (evt.summary || '').replace(/[\r\n]/g, ' ') + '\r\n';
      ics += 'DESCRIPTION:' + (evt.description || '').replace(/[\r\n]/g, ' ') + '\r\n';
      ics += 'END:VEVENT\r\n';
    });
    ics += 'END:VCALENDAR';
    return ics;
  }

  function openCalendarSheet(trip, card) {
    var existing = document.getElementById('calSheetOverlay');
    if (existing) existing.remove();

    var events = buildCalendarEvents(trip, card);
    var defaultId = events.find(function (e) { return e.id === 'booking'; }) ?
      'booking' :
      ((events.find(function (e) { return e.id === 'leave'; }) ? 'leave' : 'trip'));
    var checkListHtml = '';
    events.forEach(function (evt) {
      var checkedAttr = evt.id === defaultId ? ' checked' : '';
      checkListHtml += '<label class="trips-cal-check">' +
        '<input type="radio" name="tripsCalOnePick" value="' + evt.id + '"' + checkedAttr + '/>' +
        '<span>' + evt.label + '</span></label>';
    });

    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var secondaryBtnHtml = isIOS
      ? '<button type="button" class="trips-cal-btn trips-cal-btn--apple"><img class="trips-cal-apple-icon" src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Apple_Calendar_%28iOS%29.svg" alt="Apple Calendar"/><span>Apple Calendar</span></button>'
      : '<button type="button" class="trips-cal-btn trips-cal-btn--download"><span class="material-symbols-outlined">download</span><span>Download Calendar File</span></button>';

    var overlay = document.createElement('div');
    overlay.id = 'calSheetOverlay';
    overlay.className = 'trips-cal-overlay';
    overlay.innerHTML = '<div class="trips-cal-popup">' +
      '<div class="trips-cal-header"><h3>Add to Calendar</h3><button type="button" class="trips-cal-close" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
      '<p class="trips-cal-note"><span class="material-symbols-outlined">info</span><span>Google Calendar adds one entry at a time. Choose one event below.</span></p>' +
      '<div class="trips-cal-list">' + checkListHtml + '</div>' +
      '<div class="trips-cal-buttons">' +
        '<button type="button" class="trips-cal-btn trips-cal-btn--google"><img class="trips-cal-google-icon" src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar"/><span>Google Calendar</span></button>' +
        secondaryBtnHtml +
      '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.trips-cal-close').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    function getPickedEvent() {
      var picked = overlay.querySelector('.trips-cal-check input[type="radio"]:checked');
      if (!picked) return null;
      var id = picked.value;
      return events.find(function (ev) { return ev.id === id; }) || null;
    }

    function downloadIcsForEvents(selectedEvents) {
      if (!selectedEvents.length) { overlay.remove(); return; }
      var ics = buildICSContent(selectedEvents);
      var blob = new Blob([ics], { type: 'text/calendar' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      var dName = ((trip.destination && trip.destination.name) || 'Trip').replace(/\s+/g, '_');
      a.download = dName + '_calendar_events.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      overlay.remove();
    }

    overlay.querySelector('.trips-cal-btn--google').addEventListener('click', function () {
      var picked = getPickedEvent();
      if (!picked) { overlay.remove(); return; }
      var url = buildGoogleCalURL(picked);
      window.open(url, '_blank');
      overlay.remove();
    });

    var appleBtn = overlay.querySelector('.trips-cal-btn--apple');
    var downloadBtn = overlay.querySelector('.trips-cal-btn--download');
    if (appleBtn) {
      appleBtn.addEventListener('click', function () { downloadIcsForEvents(events); });
    }
    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () { downloadIcsForEvents(events); });
    }
  }

  /* ─── Change Window popup ────────────────────────────── */

  function getAllAvailableWindows() {
    var data;
    try { data = JSON.parse(localStorage.getItem(ADVISOR_DATA_KEY) || '{}'); } catch (e) { data = {}; }
    var todayISO = new Date().toISOString().slice(0, 10);
    var windows = [];
    (data.gifts || []).forEach(function (g) {
      if (g.end >= todayISO) windows.push({ type: 'free', name: g.name, start: g.start, end: g.end, days: g.days, leaves: 0 });
    });
    (data.bridges || []).forEach(function (b) {
      if (b.end >= todayISO) windows.push({ type: 'golden', name: b.name, start: b.start, end: b.end, days: b.days, leaves: b.leaves });
    });
    (data.megas || []).forEach(function (m) {
      if (m.end >= todayISO) {
        var n = m.days === 9 ? '9-Day Mega-Bridge' : (m.days + '-Day Long Bridge');
        windows.push({ type: 'mega', name: n, start: m.start, end: m.end, days: m.days, leaves: m.leaves });
      }
    });
    windows.sort(function (a, b) { return a.start.localeCompare(b.start); });
    return windows;
  }

  function openChangeWindowPopup(currentTrip, tripIdx) {
    var existing = document.getElementById('changeWindowOverlay');
    if (existing) existing.remove();

    var windows = getAllAvailableWindows();
    var confirmedTrips = getConfirmedTrips();
    var usedStarts = {};
    confirmedTrips.forEach(function (t) { usedStarts[t.windowStart] = true; });

    var listHtml = '';
    windows.forEach(function (w) {
      var isCurrent = w.start === currentTrip.windowStart;
      var isUsed = !isCurrent && usedStarts[w.start];
      var typeCls = w.type === 'free' ? 'trips-cw-item--free' : (w.type === 'golden' ? 'trips-cw-item--golden' : 'trips-cw-item--mega');
      var disabledCls = isUsed ? ' trips-cw-item--disabled' : '';
      var currentCls = isCurrent ? ' trips-cw-item--current' : '';
      var typeLabel = w.type === 'golden' ? 'Golden Bridge' : (w.type === 'mega' ? 'Mega-Bridge' : 'Free Holiday');
      listHtml += '<button type="button" class="trips-cw-item ' + typeCls + disabledCls + currentCls + '" data-start="' + w.start + '"' + (isUsed ? ' disabled' : '') + '>' +
        '<div class="trips-cw-item-name">' + (w.name || typeLabel).replace(/</g, '&lt;') + '</div>' +
        '<div class="trips-cw-item-meta">' + formatRange(w.start, w.end) + ' • ' + w.days + 'D' + (isCurrent ? ' • Current' : '') + (isUsed ? ' • In use' : '') + '</div>' +
      '</button>';
    });

    var overlay = document.createElement('div');
    overlay.id = 'changeWindowOverlay';
    overlay.className = 'trips-cw-overlay';
    overlay.innerHTML = '<div class="trips-cw-popup">' +
      '<div class="trips-cw-header"><h3>Change Window</h3><button type="button" class="trips-cw-close" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>' +
      '<div class="trips-cw-list">' + listHtml + '</div>' +
    '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.trips-cw-close').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.trips-cw-item:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newStart = btn.getAttribute('data-start');
        if (newStart === currentTrip.windowStart) { overlay.remove(); return; }
        var w = windows.find(function (x) { return x.start === newStart; });
        if (!w) return;

        /* Ensure the new window is toggled on in calendar selections */
        if (w.type === 'free') {
          try {
            var pl = JSON.parse(localStorage.getItem(PLANNED_TRIPS_KEY) || '[]');
            if (pl.indexOf(w.start) === -1) { pl.push(w.start); localStorage.setItem(PLANNED_TRIPS_KEY, JSON.stringify(pl)); }
          } catch (ex) {}
        } else {
          try {
            var sb = JSON.parse(localStorage.getItem(SELECTED_BRIDGES_KEY) || '[]');
            if (sb.indexOf(w.start) === -1) { sb.push(w.start); localStorage.setItem(SELECTED_BRIDGES_KEY, JSON.stringify(sb)); }
          } catch (ex) {}
        }

        var allTrips = getConfirmedTrips();
        var match = allTrips.find(function (t) { return t.windowStart === currentTrip.windowStart; });
        if (match) {
          match.windowStart = w.start;
          match.windowEnd = w.end;
          match.windowDays = w.days;
          match.windowName = w.name;
          match.windowType = w.type;
          match.leaves = w.leaves || 0;
          localStorage.setItem(CONFIRMED_TRIPS_KEY, JSON.stringify(allTrips));
        }
        overlay.remove();
        populate();
      });
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function applyInlineFormat(seg) {
    return seg
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
  }

  function formatWvText(s) {
    if (!s) return '';
    var escaped = escapeHtml(s).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    var lines = escaped.split('\n');
    var html = '';
    var i = 0;

    function flushList(listType, items) {
      if (items.length === 0) return;
      var tag = listType === 'ol' ? 'ol' : 'ul';
      html += '<' + tag + '>';
      items.forEach(function (it) { html += '<li>' + applyInlineFormat(it) + '</li>'; });
      html += '</' + tag + '>';
    }

    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();
      if (trimmed === '') {
        i++;
        continue;
      }
      var olMatch = trimmed.match(/^\d+[\.\)]?\s+(.*)$/);
      var ulMatch = trimmed.match(/^[-*•·]\s+(.*)$/) || trimmed.match(/^\*\s+(.*)$/);
      if (olMatch) {
        var olItems = [];
        while (i < lines.length) {
          var t = lines[i].trim();
          var m = t.match(/^\d+[\.\)]?\s+(.*)$/);
          if (!m) break;
          olItems.push(m[1]);
          i++;
        }
        flushList('ol', olItems);
        continue;
      }
      if (ulMatch) {
        var ulItems = [];
        while (i < lines.length) {
          var ul = lines[i].trim().match(/^[-*•·]\s+(.*)$/) || lines[i].trim().match(/^\*\s+(.*)$/);
          if (!ul) break;
          ulItems.push(ul[1]);
          i++;
        }
        flushList('ul', ulItems);
        continue;
      }
      var para = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^\d+[\.\)]?\s+/.test(lines[i].trim()) && !/^[-*•·]\s+/.test(lines[i].trim()) && !/^\*\s+/.test(lines[i].trim())) {
        para.push(lines[i]);
        i++;
      }
      html += '<p>' + applyInlineFormat(para.join('\n').trim()) + '</p>';
    }
    return html || '<p>' + applyInlineFormat(escaped.trim()) + '</p>';
  }

  function openTripDetail(trip) {
    var overlay = document.getElementById('tripDetailOverlay');
    var titleEl = document.getElementById('tripDetailTitle');
    var imgEl = document.getElementById('tripDetailImg');
    var catEl = document.getElementById('tripDetailCategory');
    var descEl = document.getElementById('tripDetailDesc');
    var underEl = document.getElementById('tripDetailUnderstand');
    var seeEl = document.getElementById('tripDetailSee');
    var descPanel = document.getElementById('tripDetailDescPanel');
    var underPanel = document.getElementById('tripDetailUnderstandPanel');
    var seePanel = document.getElementById('tripDetailSeePanel');
    if (!overlay || !titleEl) return;
    var d = trip.destination || {};
    titleEl.textContent = (d.name || '') + ' · ' + formatRange(trip.windowStart, trip.windowEnd);
    if (imgEl) {
      imgEl.style.backgroundImage = 'none';
      imgEl.style.backgroundColor = 'var(--gray-200)';
      var detailImg = (d.imageUrl || '').trim();
      if ((d.isHometown || d.slug === '__hometown__') && !detailImg) detailImg = HOMETOWN_IMAGE_URL;
      if (detailImg) {
        var sep = detailImg.indexOf('?') >= 0 ? '&' : '?';
        var bust = detailImg + sep + '_t=' + Date.now();
        imgEl.style.backgroundImage = 'url("' + bust.replace(/"/g, '%22') + '")';
        imgEl.style.backgroundColor = 'transparent';
      }
    }
    if (catEl) catEl.textContent = (d.isHometown || d.slug === '__hometown__') ? 'Hometown visit' : (d.category || '');
    var descHtml = (d.isHometown || d.slug === '__hometown__')
      ? ('<p>Family time in your hometown.' +
          ((trip.leaves || 0) > 0
            ? ' Use reminders below for leave and travel.'
            : ' This window does not need leave days; use transport reminders if you are booking travel.') +
        '</p>')
      : formatWvText((d.description || '') || 'No description available.');
    var underHtml = formatWvText(d.understand_brief || '');
    var seeHtml = formatWvText(d.see_brief || '');
    if (descEl) descEl.innerHTML = descHtml;
    if (underEl) underEl.innerHTML = underHtml || 'No content.';
    if (seeEl) seeEl.innerHTML = seeHtml || 'No content.';
    var tabs = overlay.querySelectorAll('.trip-detail-tab');
    var panels = overlay.querySelectorAll('.trip-detail-panel');
    tabs.forEach(function (t) { t.classList.remove('trip-detail-tab--active'); });
    panels.forEach(function (p) { p.classList.remove('trip-detail-panel--active'); });
    if (tabs[0]) tabs[0].classList.add('trip-detail-tab--active');
    if (descPanel) descPanel.classList.add('trip-detail-panel--active');
    var underTab = overlay.querySelector('.trip-detail-tab[data-tab="understand"]');
    var seeTab = overlay.querySelector('.trip-detail-tab[data-tab="see"]');
    if (underTab) underTab.style.display = underHtml ? '' : 'none';
    if (seeTab) seeTab.style.display = seeHtml ? '' : 'none';
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function setActiveTab(tabName) {
    var overlay = document.getElementById('tripDetailOverlay');
    if (!overlay) return;
    overlay.querySelectorAll('.trip-detail-tab').forEach(function (t) {
      t.classList.toggle('trip-detail-tab--active', t.getAttribute('data-tab') === tabName);
    });
    overlay.querySelectorAll('.trip-detail-panel').forEach(function (p) {
      var id = p.id;
      var isDesc = id === 'tripDetailDescPanel' && tabName === 'desc';
      var isUnder = id === 'tripDetailUnderstandPanel' && tabName === 'understand';
      var isSee = id === 'tripDetailSeePanel' && tabName === 'see';
      p.classList.toggle('trip-detail-panel--active', isDesc || isUnder || isSee);
    });
  }

  function closeTripDetail() {
    var overlay = document.getElementById('tripDetailOverlay');
    if (overlay) {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function wireTripDetailListeners() {
    var closeBtn = document.querySelector('.trip-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', closeTripDetail);
    var overlay = document.getElementById('tripDetailOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeTripDetail();
      });
      overlay.querySelectorAll('.trip-detail-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var tab = btn.getAttribute('data-tab');
          if (tab) setActiveTab(tab);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireTripDetailListeners);
  } else {
    wireTripDetailListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populate);
  } else {
    populate();
  }

  window.addEventListener('storage', function (e) {
    if (e.key === CONFIRMED_TRIPS_KEY) populate();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') populate();
  });
})();
