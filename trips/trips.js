/* Trips: confirmed trips from Plan + leaves saved logic */
(function () {
  'use strict';

  var CONFIRMED_TRIPS_KEY = 'holidayHacker_confirmedTrips';
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function getConfirmedTrips() {
    try {
      return JSON.parse(localStorage.getItem(CONFIRMED_TRIPS_KEY) || '[]');
    } catch (e) { return []; }
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
    var trips = getConfirmedTrips();
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
      var planned = JSON.parse(localStorage.getItem('holidayHacker_plannedTrips') || '[]');
      var selected = JSON.parse(localStorage.getItem('holidayHacker_selectedBridges') || '[]');
      var data = JSON.parse(localStorage.getItem('holidayHacker_advisorData') || '{}');
      var gifts = (data.gifts || []).filter(function (g) { return planned.indexOf(g.start) !== -1; });
      var bridges = (data.bridges || []).filter(function (b) { return selected.indexOf(b.start) !== -1; });
      var megas = (data.megas || []).filter(function (m) { return selected.indexOf(m.start) !== -1; });
      plannedCount = gifts.length + bridges.length + megas.length;
    } catch (e) {}
    var holidaysEl = document.querySelector('.passport-stat-card--holidays h3');
    if (holidaysEl) holidaysEl.textContent = plannedCount;

    var travelModes = getTravelModes();
    var html = '';
    trips.forEach(function (t, idx) {
      var d = t.destination || {};
      var imgUrl = d.imageUrl || '';
      var imgStyle = imgUrl ? 'background-image: url(\'' + imgUrl.replace(/'/g, "\\'") + '\')' : 'background-color: var(--gray-300)';
      var label = formatRange(t.windowStart, t.windowEnd);
      var leavesUsed = t.leaves || 0;
      var badge = t.windowType === 'free' ? 'Confirmed' : 'Draft';
      var badgeCls = t.windowType === 'free' ? 'trips-card-badge--confirmed' : 'trips-card-badge--draft';
      var meta = t.windowDays + 'D/' + (t.windowDays - 1) + 'N • ' + leavesUsed + ' Leave' + (leavesUsed !== 1 ? 's' : '') + ' used';
      var destName = (d.name || '').replace(/</g, '&lt;');
      html += '<div class="trips-card" data-idx="' + idx + '">' +
        '<div class="trips-card-img-wrap">' +
          '<div class="trips-card-img" style="' + imgStyle + '"></div>' +
          '<div class="trips-card-overlay"></div>' +
          '<div class="trips-card-caption">' +
            '<span class="trips-card-badge ' + badgeCls + '">' + badge + '</span>' +
            '<h4 class="trips-card-title">' + destName + '</h4>' +
          '</div>' +
        '</div>' +
        '<div class="trips-card-body">' +
          '<div class="trips-card-meta">' +
            '<span class="trips-card-date"><span class="material-symbols-outlined">date_range</span> ' + label + '</span>' +
            '<span class="trips-card-days">' + meta + '</span>' +
          '</div>' +
          '<div class="trips-card-toggle-row">' +
            '<label class="trips-card-reminders-toggle"><span class="trips-card-switch"><input type="checkbox" class="trips-card-reminders-cb" checked/><span class="trips-card-switch-slider"></span></span><span class="trips-card-reminders-label">Reminders</span></label>' +
            '<button type="button" class="trips-card-expand-btn" aria-label="Expand"><span class="material-symbols-outlined">expand_more</span></button>' +
          '</div>' +
          '<div class="trips-card-expanded">' +
            '<div class="trips-card-leave-reminder">' +
              '<div class="trips-card-reminder-row">' +
                '<div class="trips-card-reminder-icon"><span class="material-symbols-outlined">event_note</span></div>' +
                '<div class="trips-card-reminder-display"><p class="trips-card-reminder-title">Leave Application</p><p class="trips-card-reminder-sub">30 days before • 10:00 AM</p></div>' +
                '<button type="button" class="trips-card-reminder-edit" aria-label="Edit"><span class="material-symbols-outlined">edit</span></button>' +
                '<button type="button" class="trips-card-advisor-toggle is-on" aria-label="Toggle reminder"></button>' +
              '</div>' +
              '<div class="trips-card-edit-wrap" style="display:none">' +
                '<section class="edit-field"><label class="edit-field-label">Days before trip</label><input type="number" class="edit-field-input trips-edit-days" min="1" max="60" value="30" placeholder="30"/></section>' +
                '<section class="edit-field"><label class="edit-field-label">Reminder time</label><input type="time" class="edit-field-input trips-edit-time" value="10:00"/></section>' +
                '<button type="button" class="trips-card-edit-done">Done</button>' +
              '</div>' +
            '</div>' +
            '<div class="trips-card-transport">' +
              '<p class="trips-card-transport-label">Transport Mode</p>' +
              '<div class="trips-card-transport-btns">' + (function () {
                var defaultMode = travelModes[0] || 'car';
                var texts = { flight: 'Remind me when prices drop', train: getTrainText(t.windowStart), bus: 'Ideal booking 30 days prior @ 8:00 AM', car: 'Pre-departure checklist' };
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
              '<button type="button" class="trips-card-actions-toggle"><span>Trip Actions</span><span class="material-symbols-outlined trips-card-actions-icon">expand_more</span></button>' +
              '<div class="trips-card-actions-grid">' +
                '<button type="button" class="trips-card-action-btn trips-card-view-details"><span class="material-symbols-outlined">info</span><span>View Details</span></button>' +
                '<button type="button" class="trips-card-action-btn"><span class="material-symbols-outlined">calendar_today</span><span>Change Window</span></button>' +
                '<button type="button" class="trips-card-action-btn"><span class="material-symbols-outlined">favorite_border</span><span>Favorite</span></button>' +
                '<button type="button" class="trips-card-action-btn"><span class="material-symbols-outlined">content_copy</span><span>Duplicate</span></button>' +
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
      var expandBtn = card.querySelector('.trips-card-expand-btn');
      var viewDetailsBtn = card.querySelector('.trips-card-view-details');
      var titleEl = card.querySelector('.trips-card-title');
      var imgWrap = card.querySelector('.trips-card-img-wrap');
      if (expandBtn) {
        expandBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          card.classList.toggle('trips-card--expanded');
          var icon = expandBtn.querySelector('.material-symbols-outlined');
          if (icon) icon.textContent = card.classList.contains('trips-card--expanded') ? 'expand_less' : 'expand_more';
        });
      }
      function openDetail() {
        if (!isNaN(idx) && trips[idx]) openTripDetail(trips[idx]);
      }
      if (viewDetailsBtn) viewDetailsBtn.addEventListener('click', function (e) { e.stopPropagation(); openDetail(); });
      if (titleEl) titleEl.addEventListener('click', function (e) { e.stopPropagation(); openDetail(); });
      if (imgWrap) imgWrap.addEventListener('click', function (e) { e.stopPropagation(); openDetail(); });
      var transportBtns = card.querySelectorAll('.trips-card-transport-btn');
      var bookingEl = card.querySelector('.trips-card-booking');
      var trip = trips[idx];
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
        btn.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
          setTransportActive(btn);
        });
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          setTransportActive(btn);
        });
      });
      var actionsToggle = card.querySelector('.trips-card-actions-toggle');
      var actionsGrid = card.querySelector('.trips-card-actions-grid');
      var actionsIcon = card.querySelector('.trips-card-actions-icon');
      if (actionsToggle && actionsGrid && actionsIcon) {
        actionsGrid.style.display = 'none';
        actionsToggle.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = actionsGrid.style.display !== 'none';
          actionsGrid.style.display = open ? 'none' : 'flex';
          actionsIcon.textContent = open ? 'expand_more' : 'expand_less';
        });
      }
      var editBtn = card.querySelector('.trips-card-reminder-edit');
      var editWrap = card.querySelector('.trips-card-edit-wrap');
      var reminderDisplay = card.querySelector('.trips-card-reminder-display');
      var editDays = card.querySelector('.trips-edit-days');
      var editTime = card.querySelector('.trips-edit-time');
      var editDone = card.querySelector('.trips-card-edit-done');
      if (editBtn && editWrap && reminderDisplay) {
        editBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          editWrap.style.display = editWrap.style.display === 'none' ? 'block' : 'none';
          if (editWrap.style.display !== 'none' && editDays && editTime) {
            var subEl = reminderDisplay.querySelector('.trips-card-reminder-sub');
            var m = subEl ? subEl.textContent : '';
            var daysMatch = m.match(/(\d+)\s*days/);
            var timeMatch = m.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (daysMatch) editDays.value = daysMatch[1];
            if (timeMatch) {
              var h = parseInt(timeMatch[1], 10);
              if (timeMatch[3].toUpperCase() === 'PM' && h < 12) h += 12;
              if (timeMatch[3].toUpperCase() === 'AM' && h === 12) h = 0;
              editTime.value = (h < 10 ? '0' : '') + h + ':' + (timeMatch[2].length < 2 ? '0' + timeMatch[2] : timeMatch[2]);
            } else { editTime.value = '10:00'; }
          }
        });
      }
      if (editDone && editWrap && reminderDisplay && editDays && editTime) {
        editDone.addEventListener('click', function (e) {
          e.stopPropagation();
          var sub = reminderDisplay.querySelector('.trips-card-reminder-sub');
          var tv = editTime.value || '10:00';
          var parts = tv.split(':');
          var h = parseInt(parts[0], 10) || 10;
          var m = (parts[1] || '00').slice(0, 2);
          var ampm = h < 12 ? 'AM' : 'PM';
          var h12 = h === 0 ? 12 : (h > 12 ? h - 12 : h);
          var timeStr = h12 + ':' + m + ' ' + ampm;
          if (sub) sub.textContent = (editDays.value || 30) + ' days before • ' + timeStr;
          editWrap.style.display = 'none';
        });
      }
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
      if (d.imageUrl) {
        var sep = d.imageUrl.indexOf('?') >= 0 ? '&' : '?';
        var bust = d.imageUrl + sep + '_t=' + Date.now();
        imgEl.style.backgroundImage = 'url("' + bust.replace(/"/g, '%22') + '")';
        imgEl.style.backgroundColor = 'transparent';
      }
    }
    if (catEl) catEl.textContent = d.category || '';
    var descHtml = formatWvText((d.description || '') || 'No description available.');
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
