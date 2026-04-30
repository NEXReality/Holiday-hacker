(function () {
  'use strict';

  var STORAGE_KEY = 'holidayHacker_user';
  var ADVISOR_DATA_KEY = 'holidayHacker_advisorData';
  var SELECTED_BRIDGES_KEY = 'holidayHacker_selectedBridges';
  var PLANNED_TRIPS_KEY = 'holidayHacker_plannedTrips';
  var PLAN_SELECTED_KEY = 'holidayHacker_planSelectedWindow';
  var TRAVEL_PREFS_KEY = 'holidayHacker_travelPreferences';
  var PLAN_SELECTED_DEST_KEY = 'holidayHacker_planSelectedDestination';
  var CONFIRMED_TRIPS_KEY = 'holidayHacker_confirmedTrips';
  var FAVORITES_KEY = 'holidayHacker_favorites';
  var VISITED_PLACES_KEY = 'holidayHacker_visitedPlaces';
  var CAL_DONE_KEY = 'holidayHacker_calSetup';
  var INITIAL_DEST_COUNT = 3;
  var HOMETOWN_SLUG = '__hometown__';
  var HOMETOWN_IMAGE_URL = 'https://img.freepik.com/free-vector/suburban-house-illustration_33099-2357.jpg';

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  var scrollEl = document.getElementById('planWindowsScroll');
  var progressText = document.getElementById('planProgressText');
  var progressFill = document.getElementById('planProgressFill');

  var allWindows = [];
  var currentFilter = 'all';
  var searchQuery = '';
  var currentUser = null;

  function formatRange(start, end) {
    var s = new Date(start + 'T00:00:00');
    var e = new Date(end + 'T00:00:00');
    return MONTHS[s.getMonth()] + ' ' + s.getDate() + ' – ' + MONTHS[e.getMonth()] + ' ' + e.getDate();
  }

  function formatStateDisplayName(state) {
    if (!state || typeof state !== 'string') return '';
    return state.replace(/_/g, ' ');
  }

  function normalizeLocationKey(str) {
    return (str || '').toLowerCase().replace(/[\s\-_.]/g, '');
  }

  function hasDistinctHometown(user) {
    if (!user) return false;
    var home = (user.homeLocation || '').trim();
    var work = (user.workLocation || '').trim();
    if (!home || !work) return false;
    return normalizeLocationKey(work) !== normalizeLocationKey(home);
  }

  function parseHomeLocation(user) {
    if (!user || !user.homeLocation) return null;
    var raw = String(user.homeLocation).trim();
    if (!raw) return null;
    var parts = raw.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
    if (!parts.length) return null;
    var city = parts[0];
    var state = parts.length > 1 ? parts[parts.length - 1] : '';
    return { city: city, state: state, raw: raw };
  }

  function getAdvisorData() {
    try {
      return JSON.parse(localStorage.getItem(ADVISOR_DATA_KEY) || '{}');
    } catch (e) { return {}; }
  }

  function getSelectedBridges() {
    try {
      return JSON.parse(localStorage.getItem(SELECTED_BRIDGES_KEY) || '[]');
    } catch (e) { return []; }
  }

  function getPlannedTrips() {
    try {
      return JSON.parse(localStorage.getItem(PLANNED_TRIPS_KEY) || '[]');
    } catch (e) { return []; }
  }

  function getPlanSelected() {
    try {
      return JSON.parse(localStorage.getItem(PLAN_SELECTED_KEY) || 'null');
    } catch (e) { return null; }
  }

  function setPlanSelected(start) {
    localStorage.setItem(PLAN_SELECTED_KEY, JSON.stringify(start));
  }

  function buildAllWindows() {
    var data = getAdvisorData();
    var selected = getSelectedBridges();
    var planned = getPlannedTrips();
    var list = [];

    /* Free holidays: show only those with "Plan trip?" toggled on in Calendar/Holidays */
    (data.gifts || []).forEach(function (g) {
      if (planned.indexOf(g.start) !== -1) {
        list.push({ type: 'free', name: g.name, start: g.start, end: g.end, days: g.days, leaves: 0 });
      }
    });

    /* Golden bridges: show only those toggled on in Calendar */
    (data.bridges || []).forEach(function (b) {
      if (selected.indexOf(b.start) !== -1) {
        list.push({ type: 'golden', name: b.name, start: b.start, end: b.end, days: b.days, leaves: b.leaves });
      }
    });

    /* Mega bridges: show only those toggled on in Calendar */
    (data.megas || []).forEach(function (m) {
      if (selected.indexOf(m.start) !== -1) {
        var n = m.days === 9 ? '9-Day Mega-Bridge' : (m.days + '-Day Long Bridge');
        list.push({ type: 'mega', name: n, start: m.start, end: m.end, days: m.days, leaves: m.leaves });
      }
    });

    list.sort(function (a, b) { return a.start.localeCompare(b.start); });
    return list;
  }

  function filterWindows() {
    var list = allWindows;
    if (currentFilter === 'free') list = list.filter(function (w) { return w.type === 'free'; });
    else if (currentFilter === 'golden') list = list.filter(function (w) { return w.type === 'golden'; });
    else if (currentFilter === 'mega') list = list.filter(function (w) { return w.type === 'mega'; });
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      list = list.filter(function (w) { return w.name.toLowerCase().indexOf(q) !== -1; });
    }
    return list;
  }

  function getCardTypeClass(w) {
    if (w.type === 'free') return 'plan-window-card--free';
    if (w.type === 'golden') return 'plan-window-card--golden';
    return 'plan-window-card--mega';
  }

  function getTypeLabel(w) {
    if (w.type === 'free') return 'Free Holiday';
    if (w.type === 'golden') return 'Golden Bridge';
    return 'Mega-Bridge';
  }

  function getConfirmedDestForWindow(windowStart) {
    var trips = getConfirmedTrips();
    var match = trips.find(function (t) { return t.windowStart === windowStart; });
    return match && match.destination ? match.destination : null;
  }

  function renderWindowCard(w, isSelected) {
    var sel = isSelected ? ' plan-window-card--selected' : '';
    var typeCls = getCardTypeClass(w);
    var tagCls = w.type === 'free' ? 'plan-tag plan-tag--free' : (w.type === 'golden' ? 'plan-tag plan-tag--bridge' : 'plan-tag plan-tag--mega');
    var title = w.name.length > 35 ? w.name.slice(0, 32) + '…' : w.name;
    var dest = getConfirmedDestForWindow(w.start);
    var hasDest = !!dest;
    var destCls = hasDest ? ' plan-window-card--has-dest' : '';
    var bgHtml = '';
    var destChip = '';
    if (hasDest) {
      var imgUrl = (dest.imageUrl || '').replace(/'/g, "\\'");
      var isHometownWin = dest.slug === HOMETOWN_SLUG || dest.isHometown;
      if (imgUrl) {
        bgHtml = '<div class="plan-window-bg" style="background-image: url(\'' + imgUrl + '\')"></div>' +
                 '<div class="plan-window-bg-overlay"></div>';
      } else if (isHometownWin) {
        var homeBg = HOMETOWN_IMAGE_URL.replace(/'/g, "\\'");
        bgHtml = '<div class="plan-window-bg" style="background-image: url(\'' + homeBg + '\')"></div>' +
                 '<div class="plan-window-bg-overlay"></div>';
      } else {
        bgHtml = '<div class="plan-window-bg plan-window-bg--no-photo"></div>' +
                 '<div class="plan-window-bg-overlay"></div>';
      }
      var destName = (dest.name || '').replace(/</g, '&lt;');
      var destState = formatStateDisplayName(dest.state || '').replace(/</g, '&lt;');
      destChip = '<div class="plan-window-dest">' +
        '<span class="material-symbols-outlined">location_on</span>' +
        '<span>' + destName + (destState ? ', ' + destState : '') + '</span>' +
      '</div>';
    }
    return '<div class="plan-window-card ' + typeCls + sel + destCls + '" data-start="' + w.start + '" data-type="' + w.type + '" title="' + (w.name || '').replace(/"/g, '&quot;') + '">' +
      bgHtml +
      '<h3 class="plan-window-title">' + title + '</h3>' +
      '<div class="plan-window-dates">' +
        '<span class="material-symbols-outlined">calendar_month</span>' +
        '<span>' + formatRange(w.start, w.end) + '</span>' +
      '</div>' +
      '<div class="plan-window-tags">' +
        '<span class="plan-tag ' + tagCls + '">' + getTypeLabel(w) + '</span>' +
        '<span class="plan-tag plan-tag--primary">' + w.days + ' Days</span>' +
        (w.leaves > 0 ? '<span class="plan-tag">' + w.leaves + ' Leave' + (w.leaves > 1 ? 's' : '') + '</span>' : '') +
      '</div>' +
      destChip +
    '</div>';
  }

  function getEmptyMessage() {
    var data = getAdvisorData();
    var hasAdvisorData = (data.gifts && data.gifts.length) || (data.bridges && data.bridges.length) || (data.megas && data.megas.length);

    if (allWindows.length === 0) {
      if (!hasAdvisorData) {
        return { title: 'Complete Calendar setup', body: 'See your trip windows after Calendar setup.', link: true };
      }
      return {
        title: 'No trip windows selected',
        body: 'Go to Calendar and toggle "Plan trip?" on free holidays or "Bridge it?" on golden/mega bridges.',
        link: true
      };
    }
    if (searchQuery) {
      return {
        title: 'No windows match your search',
        body: 'Try a different search term.',
        link: false
      };
    }
    var msg = {};
    if (currentFilter === 'free') {
      msg = { title: 'No free holidays selected', body: 'Go to Calendar or Holidays and toggle "Plan trip?" on free holidays.', link: true };
    } else if (currentFilter === 'golden') {
      msg = { title: 'No golden bridges selected', body: 'Go to Calendar and toggle "Bridge it?" on golden bridges.', link: true };
    } else if (currentFilter === 'mega') {
      msg = { title: 'No mega-bridges selected', body: 'Go to Calendar and toggle "Bridge it?" on mega-bridges.', link: true };
    } else {
      msg = { title: 'No trip windows yet', body: 'Go to Calendar and toggle "Plan trip?" or "Bridge it?" to add windows.', link: true };
    }
    return msg;
  }

  function renderWindows() {
    if (!scrollEl) return;
    var filtered = filterWindows();
    if (allWindows.length === 0) {
      var m = getEmptyMessage();
      scrollEl.innerHTML = '<div class="plan-windows-empty"><p class="plan-windows-empty-title">' + m.title + '</p><p class="plan-windows-empty-body">' + m.body + '</p>' + (m.link ? '<a href="../calendar/index.html" class="plan-empty-link">Go to Calendar</a>' : '') + '</div>';
      return;
    }
    if (filtered.length === 0) {
      var m = getEmptyMessage();
      scrollEl.innerHTML = '<div class="plan-windows-empty"><p class="plan-windows-empty-title">' + m.title + '</p><p class="plan-windows-empty-body">' + m.body + '</p>' + (m.link ? '<a href="../calendar/index.html" class="plan-empty-link">Go to Calendar</a>' : '') + '</div>';
      return;
    }
    var selectedStart = getPlanSelected();
    var html = filtered.map(function (w) {
      return renderWindowCard(w, selectedStart === w.start);
    }).join('');
    scrollEl.innerHTML = html;
    scrollEl.querySelectorAll('.plan-window-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var start = card.getAttribute('data-start');
        setPlanSelected(start);
        updateUI();
        if (currentUser && allDestinations.length) {
          loadAndScoreDestinations(currentUser);
        } else if (currentUser) {
          fetchRecommendationData(currentUser);
        }
      });
    });
  }

  function updateProgress() {
    if (!progressText || !progressFill) return;
    var data = getAdvisorData();
    var totalDays = 0;
    (data.gifts || []).forEach(function (g) { totalDays += (g.days || 0); });
    (data.bridges || []).forEach(function (b) { totalDays += (b.days || 0); });
    (data.megas || []).forEach(function (m) { totalDays += (m.days || 0); });

    if (totalDays <= 0) {
      progressText.textContent = '0%';
      progressFill.setAttribute('stroke-dashoffset', 100);
      return;
    }

    var usedDays = allWindows.reduce(function (s, w) { return s + (w.days || 0); }, 0);
    var pct = Math.min(100, Math.round((usedDays / totalDays) * 100));

    progressText.textContent = pct + '%';
    var circumference = 100;
    progressFill.setAttribute('stroke-dashoffset', circumference - (pct / 100) * circumference);
  }

  function updateUI() {
    renderWindows();
    updateProgress();
  }

  function wireFilterPills() {
    var pills = document.querySelectorAll('#planFilterPills .plan-pill');
    pills.forEach(function (p) {
      p.addEventListener('click', function () {
        pills.forEach(function (x) { x.classList.remove('plan-pill--active'); });
        p.classList.add('plan-pill--active');
        currentFilter = p.getAttribute('data-filter');
        renderWindows();
      });
    });
  }

  function wireSearch() {
    var btn = document.getElementById('planSearchBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var q = prompt('Search by holiday title:', searchQuery);
      if (q === null) return;
      searchQuery = (q || '').trim();
      renderWindows();
    });
  }

  /* ─── Recommendation Engine ──────────────────────────────────────────── */

  var recConfig = {};
  var stateCityData = { states: [] };
  var allDestinations = [];
  var scoredDestinations = [];
  var destVisibleCount = INITIAL_DEST_COUNT;

  function getTravelPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(TRAVEL_PREFS_KEY) || '{}');
      var modes = p.travelModes || (p.travelMode ? [p.travelMode] : null) || ['car'];
      return {
        travelModes: Array.isArray(modes) && modes.length ? modes : ['car'],
        hasKidsUnder10: !!p.hasKidsUnder10,
        destinationSegments: Array.isArray(p.destinationSegments) ? p.destinationSegments : []
      };
    } catch (e) { return { travelModes: ['car'], hasKidsUnder10: false, destinationSegments: [] }; }
  }

  function getUserCoords(user) {
    var loc = (user && user.workLocation) || '';
    if (!loc) return { lat: 12.9716, lon: 77.5946 };
    var parts = loc.split(',').map(function (p) { return p.trim(); });
    var cityPart = parts[0] || '';
    var statePart = parts.length > 1 ? parts[parts.length - 1] : '';
    for (var i = 0; i < stateCityData.states.length; i++) {
      var s = stateCityData.states[i];
      var stateMatches = !statePart || s.name.toLowerCase() === statePart.toLowerCase();
      if (!stateMatches) continue;
      if (cityPart) {
        if (s.name.toLowerCase() === cityPart.toLowerCase()) return s.coordinates || { lat: 12.9716, lon: 77.5946 };
        var cities = s.cities || [];
        for (var j = 0; j < cities.length; j++) {
          var c = cities[j];
          var cName = typeof c === 'string' ? c : (c && c.name);
          if (cName && cName.toLowerCase() === cityPart.toLowerCase()) {
            if (c.lat != null && c.lon != null) return { lat: c.lat, lon: c.lon };
            return s.coordinates || { lat: 12.9716, lon: 77.5946 };
          }
        }
      }
      if (s.coordinates) return s.coordinates;
    }
    return { lat: 12.9716, lon: 77.5946 };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  function getAvailableDays() {
    var sel = getPlanSelected();
    if (!sel || !allWindows.length) return 2;
    var w = allWindows.find(function (x) { return x.start === sel; });
    return w ? (w.days || 2) : 2;
  }

  function getBandForDistance(km, mode) {
    var bands = (recConfig.distance_bands_by_mode || {})[mode] || recConfig.distance_bands_by_mode.car;
    if (km <= 300) return bands['0_300'] || 0;
    if (km <= 600) return bands['300_600'] || 0;
    return bands['600_plus'] || 0;
  }

  function hasKeyword(text, keywords) {
    if (!text || !keywords || !keywords.length) return false;
    var t = String(text).toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (t.indexOf(keywords[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  function isUserHomeCity(dest, user) {
    if (!user || !dest) return false;
    var loc = (user.workLocation || user.homeLocation || '').trim();
    if (!loc) return false;
    var cityPart = loc.split(',')[0];
    if (!cityPart) return false;
    cityPart = cityPart.trim().toLowerCase();
    var destName = (dest.name || '').toLowerCase();
    var altNames = (dest.alt_names || []).map(function (a) { return String(a).toLowerCase(); });
    var toMatch = [destName].concat(altNames);
    var cityAliases = { bangalore: ['bengaluru', 'bangalore'], bengaluru: ['bengaluru', 'bangalore'], mysore: ['mysuru', 'mysore'], mysuru: ['mysuru', 'mysore'], mangalore: ['mangaluru', 'mangalore'], mangaluru: ['mangaluru', 'mangalore'], trivandrum: ['thiruvananthapuram', 'trivandrum'], thiruvananthapuram: ['thiruvananthapuram', 'trivandrum'], cochin: ['kochi', 'cochin'], kochi: ['kochi', 'cochin'] };
    var aliases = cityAliases[cityPart] || [cityPart];
    for (var i = 0; i < toMatch.length; i++) {
      var m = toMatch[i];
      for (var j = 0; j < aliases.length; j++) {
        if (m === aliases[j] || m.indexOf(aliases[j]) !== -1 || aliases[j].indexOf(m) !== -1) return true;
      }
    }
    return false;
  }

  function getAllBriefText(d) {
    var sb = d.section_briefs || {};
    var parts = [];
    ['understand', 'see', 'do', 'get_in'].forEach(function (k) {
      if (sb[k] && sb[k].brief) parts.push(sb[k].brief);
    });
    if (d.description) parts.push(d.description);
    if (d.category) parts.push(d.category);
    return parts.join(' ');
  }

  function scoreDestination(d, userCoords, prefs, availableDays, tripMonth) {
    var cfg = recConfig;
    var fb = cfg.fallbacks || {};
    var score = 0;

    var dist = d.distance_km;
    if (userCoords && d.coordinates && d.coordinates.lat != null) {
      dist = haversineKm(userCoords.lat, userCoords.lon, d.coordinates.lat, d.coordinates.lon);
    } else if (dist == null) dist = 600;

    var minDays = d.min_days != null ? d.min_days : (fb.min_days || 2);
    var durationWeight = (cfg.decision_table && cfg.decision_table.duration_match && cfg.decision_table.duration_match.weight) || 50;
    if (minDays > availableDays) {
      score -= 80;
    } else {
      score += durationWeight;
      if (availableDays <= 3 && minDays <= 3) score += 25;
      else if (availableDays >= 5 && minDays >= 4) score += 25;
      else if (availableDays >= 7 && minDays >= 5) score += 15;
    }

    var modes = prefs.travelModes || ['car'];
    var bestModeScore = -999;
    for (var m = 0; m < modes.length; m++) {
      var ms = getBandForDistance(dist, modes[m]);
      if (ms > bestModeScore) bestModeScore = ms;
    }
    score += bestModeScore > -999 ? bestModeScore : getBandForDistance(dist, 'car');
    var distWeight = cfg.distance_actual_weight;
    if (typeof distWeight === 'number' && distWeight !== 0) {
      score += Math.round((500 - dist) * distWeight);
    }

    var briefText = getAllBriefText(d);
    var cat = (d.category || '').toLowerCase();
    var spiritualSite = cat.indexOf('religious') !== -1 || hasKeyword(briefText, ['temple', 'pilgrimage', 'shrine', 'sabarimala']);
    var primaryReligious = cat.indexOf('religious') !== -1 || cat.indexOf('spiritual') !== -1;
    var segments = prefs.destinationSegments || [];
    var spiritualPenalty = (cfg.spiritual_not_selected_penalty != null) ? cfg.spiritual_not_selected_penalty : -80;
    if (segments.indexOf('spiritual') !== -1 && spiritualSite) score += 30;
    else if (primaryReligious) score += spiritualPenalty;
    else if (segments.length) {
      var segMap = cfg.destination_segments || {};
      for (var s = 0; s < segments.length; s++) {
        if (segments[s] === 'spiritual') continue;
        var kw = segMap[segments[s]];
        if (kw && hasKeyword(briefText, kw)) { score += 25; break; }
      }
    }

    var richness = (d.ranking_signals && d.ranking_signals.content_richness_score) != null
      ? d.ranking_signals.content_richness_score
      : (fb.content_richness_score || 0.3);
    var mult = cfg.popularity_multiplier;
    if (typeof mult === 'number' && mult > 0) {
      score += Math.round(richness * mult);
    } else {
      var bands = cfg.popularity_bands || {};
      if (bands.high && richness >= bands.high.min) score += (bands.high.weight || 50);
      else if (bands.medium && richness >= bands.medium.min) score += (bands.medium.weight || 25);
      else if (bands.low && richness >= bands.low.min) score += (bands.low.weight || 10);
      else score += 5;
    }

    var credRecs = d.credibility_recognitions;
    if (Array.isArray(credRecs) && credRecs.length) {
      var credWeights = cfg.credibility_weights || {};
      for (var c = 0; c < credRecs.length; c++) {
        var w = credWeights[credRecs[c]];
        if (typeof w === 'number') score += w;
      }
    }

    var hasKids = prefs.hasKidsUnder10;
    if (hasKids && hasKeyword(briefText, cfg.child_friendly_keywords || [])) {
      score += (cfg.decision_table && cfg.decision_table.child_friendly && cfg.decision_table.child_friendly.weight) || 20;
    }
    if (hasKids && hasKeyword(briefText, cfg.strenuous_keywords || [])) {
      score += (cfg.decision_table && cfg.decision_table.strenuous_penalty && cfg.decision_table.strenuous_penalty.weight) || -40;
    }

    var sm = cfg.seasonal_map || {};
    var summerMonths = sm.summer_risk_months || [3, 4, 5];
    var monsoonMonths = sm.monsoon_risk_months || [6, 7, 8];
    var monsoonLandslide = sm.monsoon_landslide_states || [];
    if (tripMonth && summerMonths.indexOf(tripMonth) !== -1) {
      if (cat.indexOf('beach') !== -1 || cat.indexOf('ruins') !== -1) score -= 30;
    }
    if (tripMonth && monsoonMonths.indexOf(tripMonth) !== -1) {
      var monsoonCats = sm.monsoon_risk_categories || [];
      var catInMonsoonRisk = monsoonCats.some(function (c) {
        return cat.indexOf(c.toLowerCase()) !== -1;
      });
      var st = (d.state || '').toLowerCase();
      var stateInLandslide = monsoonLandslide.some(function (x) { return x.toLowerCase() === st; });
      if (catInMonsoonRisk && stateInLandslide) score -= 40;
    }
    var peakMonths = sm.peak_season_months || [10, 11, 12, 1, 2];
    var summerCats = sm.summer_risk_categories || ['Beaches', 'Ancient Ruins'];
    if (tripMonth && peakMonths.indexOf(tripMonth) !== -1) {
      var catInPeakBonus = summerCats.some(function (c) {
        return cat.indexOf(c.toLowerCase()) !== -1;
      });
      if (catInPeakBonus) {
        var bonus = cfg.peak_season_bonus != null ? cfg.peak_season_bonus : 25;
        score += bonus;
      }
    }

    return { score: score, distance_km: dist, min_days: minDays };
  }

  function isSpiritualSite(d) {
    var cat = (d.category || '').toLowerCase();
    var brief = (d.description || '') + ' ' + (d.name || '');
    return cat.indexOf('religious') !== -1 || cat.indexOf('spiritual') !== -1 ||
      hasKeyword(brief, ['temple', 'pilgrimage', 'shrine', 'sabarimala']);
  }

  var CREDIBILITY_LABELS = { unesco_world_heritage: 'UNESCO', unesco_tentative: 'UNESCO Tentative', geo_heritage: 'Geo-heritage', asi_monument: 'ASI Monument' };

  function deriveTags(d, hasKids, tripMonth) {
    var tags = [];
    var credRecs = d.credibility_recognitions;
    if (Array.isArray(credRecs) && credRecs.length) {
      var label = CREDIBILITY_LABELS[credRecs[0]] || credRecs[0];
      tags.push({ text: label, cls: 'plan-dest-badge--credibility', prio: 11 });
    }
    var sm = recConfig.seasonal_map || {};
    var summerMonths = sm.summer_risk_months || [3, 4, 5];
    var isSummer = tripMonth && summerMonths.indexOf(tripMonth) !== -1;
    var months = d.ideal_months || (d.best_time_to_visit && d.best_time_to_visit.months) || (d.climate_profile && d.climate_profile.peak_season_months) || [];
    var cat = (d.category || '').toLowerCase();
    var spiritual = isSpiritualSite(d);
    if (months.length > 0 && months.length <= 3) {
      var names = months.map(function (m) { return MONTHS[m - 1] || ''; }).filter(Boolean);
      if (names.length) tags.push({ text: 'Ideal in ' + names.join('/'), cls: 'plan-dest-badge--ideal', prio: 10 });
    } else {
      var brief = getAllBriefText(d);
      var cf = hasKeyword(brief, recConfig.child_friendly_keywords || []);
      var strenuous = hasKeyword(brief, recConfig.strenuous_keywords || []);
      if (hasKids) {
        if (cf && !strenuous) tags.push({ text: 'Family friendly', cls: '', prio: 8 });
        if (cf) tags.push({ text: 'Child friendly', cls: '', prio: 7 });
      }
      if (isSummer && (cat.indexOf('beach') !== -1 || cat.indexOf('nature') !== -1)) tags.push({ text: 'Best in summer', cls: '', prio: 5 });
      if ((d.state === 'Kerala' || d.state === 'Karnataka' || d.state === 'Tamil_Nadu' || d.state === 'Andhra_Pradesh' || d.state === 'Telangana' || d.state === 'Puducherry' || d.state === 'Lakshadweep') && cat.indexOf('nature') !== -1) tags.push({ text: 'Suitable in monsoon', cls: '', prio: 5 });
      if (!spiritual && !cf && !strenuous && (cat.indexOf('garden') !== -1 || cat.indexOf('park') !== -1 || cat.indexOf('nature') !== -1 || cat.indexOf('wildlife') !== -1 || cat.indexOf('mountain') !== -1)) tags.push({ text: 'Best for couples', cls: '', prio: 6 });
    }
    var minD = d.min_days != null ? d.min_days : 2;
    var nights = Math.max(1, minD - 1);
    tags.push({ text: minD + 'D/' + nights + 'N', cls: '', prio: 1 });
    tags.sort(function (a, b) { return (b.prio || 0) - (a.prio || 0); });
    return tags.slice(0, 1);
  }

  function getPlanFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch (e) { return []; }
  }
  function isDestFavorite(slug) {
    return getPlanFavorites().some(function (f) { return f.destination && f.destination.slug === slug; });
  }

  function getVisitedPlaces() {
    try {
      var arr = JSON.parse(localStorage.getItem(VISITED_PLACES_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function setVisitedPlaces(arr) {
    localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(arr || []));
  }

  /* Resolve "Bangalore" → "bengaluru", "Bombay" → "mumbai", etc., using the
   * alias map shipped in database/state-city/data.json. Falls back to the
   * normalised raw string when no alias is found. */
  function planAliasCanonical(s) {
    var key = normalizeLocationKey(s);
    if (!key) return '';
    var map = (stateCityData && stateCityData.aliases) || {};
    return map[key] || key;
  }

  /* A destination is considered "visited" when:
   * - the visited entry is a single token (state or single-name city/UT, e.g. "Goa", "Karnataka")
   *   → matches every destination whose state or name equals that token; or
   * - the visited entry is "City, State"
   *   → matches a destination whose name == City and state == State.
   * Comparison runs through the alias map AND whitespace/punctuation/case
   * normalisation, so "Bangalore", "Bengaluru" and "bengaluru" all match
   * "Bengaluru, Karnataka". */
  function isDestinationVisited(d, visitedList) {
    if (!d || !visitedList || !visitedList.length) return false;
    var dName = planAliasCanonical(d.name);
    var dState = planAliasCanonical(d.state);
    for (var i = 0; i < visitedList.length; i++) {
      var entry = String(visitedList[i] || '').trim();
      if (!entry) continue;
      var parts = entry.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
      if (parts.length === 1) {
        var token = planAliasCanonical(parts[0]);
        if (token && (token === dState || token === dName)) return true;
      } else {
        var pCity = planAliasCanonical(parts[0]);
        var pState = planAliasCanonical(parts[parts.length - 1]);
        if (pCity === dName && (!pState || pState === dState)) return true;
      }
    }
    return false;
  }

  /* Toggle the visited flag for a single destination. When unmarking, drops
   * any matching entry (city-level or state-level) so the toggle truly turns off. */
  function setDestinationVisited(dest, makeVisited) {
    if (!dest || !dest.raw || !dest.raw.name) return;
    var canonName = planAliasCanonical(dest.raw.name);
    var canonState = planAliasCanonical(dest.raw.state);
    var arr = getVisitedPlaces().filter(function (entry) {
      var parts = String(entry || '').split(',').map(function (p) { return p.trim(); }).filter(Boolean);
      if (parts.length === 1) {
        var t = planAliasCanonical(parts[0]);
        return !(t === canonName || t === canonState);
      }
      var pc = planAliasCanonical(parts[0]);
      var ps = planAliasCanonical(parts[parts.length - 1]);
      return !(pc === canonName && (!ps || ps === canonState));
    });
    if (makeVisited) {
      var stateDisp = formatStateDisplayName(dest.raw.state || '');
      var label = stateDisp ? (dest.raw.name + ', ' + stateDisp) : dest.raw.name;
      arr.push(label);
    }
    setVisitedPlaces(arr);
  }

  function closeAllPlanMenus() {
    document.querySelectorAll('.plan-dest-menu').forEach(function (m) {
      if (!m.hidden) m.hidden = true;
    });
    document.querySelectorAll('.plan-dest-menu-btn[aria-expanded="true"]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
  }

  function refreshVisitedFlags() {
    var visitedList = getVisitedPlaces();
    scoredDestinations.forEach(function (d) {
      d.visited = isDestinationVisited(d.raw, visitedList);
    });
    scoredDestinations.sort(function (a, b) {
      if (a.visited !== b.visited) return a.visited ? 1 : -1;
      var diff = (b.score || 0) - (a.score || 0);
      if (diff !== 0) return diff;
      return (b.content_richness || 0) - (a.content_richness || 0);
    });
  }

  function renderDestCard(dest, isSelected) {
    var d = dest.raw;
    var tags = dest.tags || [];
    var imgUrl = (d.images && d.images[0] && d.images[0].url) || '';
    var selCls = isSelected ? ' plan-dest-card--selected' : '';
    var visitedCls = dest.visited ? ' plan-dest-card--visited' : '';
    var bestTag = tags[0];
    var tagHtml = bestTag ? '<span class="plan-dest-badge ' + (bestTag.cls || '') + '">' + (bestTag.text || '').replace(/</g, '&lt;') + '</span>' : '';
    var scoreDebug = '<span class="plan-dest-score-debug" title="Calculated score">' + (dest.score != null ? dest.score : '–') + '</span>';
    var favActive = isDestFavorite(d.slug);
    var favIconName = favActive ? 'favorite' : 'favorite_border';
    var favActiveCls = favActive ? ' plan-dest-fav--active' : '';
    var slugAttr = (d.slug || '').replace(/"/g, '&quot;');
    return '<div class="plan-dest-card' + selCls + visitedCls + '" data-slug="' + slugAttr + '">' +
      '<div class="plan-dest-img" style="background-image: url(\'' + (imgUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%236b7280%22 width=%22100%22 height=%22100%22/></svg>').replace(/'/g, "\\'") + '\')"></div>' +
      '<div class="plan-dest-overlay"></div>' +
      '<button type="button" class="plan-dest-fav' + favActiveCls + '" data-slug="' + slugAttr + '" aria-label="Favorite"><span class="material-symbols-outlined">' + favIconName + '</span></button>' +
      '<div class="plan-dest-badges">' + tagHtml + scoreDebug + '</div>' +
      '<div class="plan-dest-info">' +
        '<div><h3 class="plan-dest-name">' + (d.name || '').replace(/</g, '&lt;') + '</h3><p class="plan-dest-region">' + formatStateDisplayName(d.state || '').replace(/</g, '&lt;') + '</p></div>' +
        '<button type="button" class="plan-dest-menu-btn" data-slug="' + slugAttr + '" aria-label="More options" aria-haspopup="menu" aria-expanded="false"><span class="material-symbols-outlined">more_vert</span></button>' +
      '</div>' +
      '<div class="plan-dest-menu" role="menu" hidden>' +
        '<button type="button" class="plan-dest-menu-item" data-action="visit" data-slug="' + slugAttr + '" role="menuitem">' +
          '<span class="material-symbols-outlined">flag</span>' +
          '<span>Already visited</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function renderHometownCard(parsed, isSelected) {
    var selCls = isSelected ? ' plan-dest-card--selected' : '';
    var city = (parsed.city || '').replace(/</g, '&lt;');
    var stateDisp = formatStateDisplayName(parsed.state || '').replace(/</g, '&lt;');
    var sub = stateDisp ? (city + ', ' + stateDisp) : city;
    var homeCardImg = HOMETOWN_IMAGE_URL.replace(/'/g, "\\'");
    return '<div class="plan-dest-card plan-dest-card--hometown' + selCls + '" data-slug="' + HOMETOWN_SLUG + '">' +
      '<div class="plan-dest-img plan-dest-img--hometown" style="background-image: url(\'' + homeCardImg + '\')"></div>' +
      '<div class="plan-dest-overlay plan-dest-overlay--hometown"></div>' +
      '<div class="plan-dest-badges">' +
        '<span class="plan-dest-badge plan-dest-badge--hometown">Hometown</span>' +
      '</div>' +
      '<div class="plan-dest-info">' +
        '<div><h3 class="plan-dest-name">Visit hometown</h3>' +
        '<p class="plan-dest-region">' + sub + '</p>' +
        '<p class="plan-dest-hometown-hint">Not traveling elsewhere? Use this break for family time back home.</p></div>' +
        '<div class="plan-dest-icons"><span class="material-symbols-outlined">home</span></div>' +
      '</div></div>';
  }

  function wirePlanDestCardClicks(sel) {
    var grid = document.getElementById('planDestGrid');
    if (!grid) return;
    grid.querySelectorAll('.plan-dest-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (
          e.target.closest('.plan-explore-btn') ||
          e.target.closest('.plan-dest-fav') ||
          e.target.closest('.plan-dest-menu-btn') ||
          e.target.closest('.plan-dest-menu')
        ) return;
        var slug = card.getAttribute('data-slug');
        var w = allWindows.find(function (x) { return x.start === sel; });
        if (!w) return;
        var trips = getConfirmedTrips();
        var existing = trips.findIndex(function (t) { return t.windowStart === sel; });

        if (slug === HOMETOWN_SLUG) {
          var parsed = currentUser ? parseHomeLocation(currentUser) : null;
          if (!parsed) return;
          var entry = {
            windowStart: w.start,
            windowEnd: w.end,
            windowDays: w.days,
            windowName: w.name,
            windowType: w.type,
            leaves: w.leaves || 0,
            destination: {
              slug: HOMETOWN_SLUG,
              name: parsed.city,
              state: parsed.state,
              category: 'Hometown',
              isHometown: true,
              imageUrl: HOMETOWN_IMAGE_URL,
              description: '',
              understand_brief: '',
              see_brief: '',
              min_days: w.days,
              distance_km: null
            }
          };
          var didAddHome = false;
          if (existing >= 0) {
            if (trips[existing].destination && trips[existing].destination.slug === HOMETOWN_SLUG) {
              trips.splice(existing, 1);
            } else {
              trips[existing] = entry;
              didAddHome = true;
            }
          } else {
            trips.push(entry);
            didAddHome = true;
          }
          setConfirmedTrips(trips);
          renderWindows();
          renderDestinations();
          if (didAddHome) showPlanToast('Hometown visit', w.name);
          return;
        }

        var dest = scoredDestinations.find(function (x) { return x.raw.slug === slug; });
        if (!dest) return;
        var imgUrl = (dest.raw.images && dest.raw.images[0] && dest.raw.images[0].url) || '';
        var sb = dest.raw.section_briefs || {};
        var entry2 = {
          windowStart: w.start,
          windowEnd: w.end,
          windowDays: w.days,
          windowName: w.name,
          windowType: w.type,
          leaves: w.leaves || 0,
          destination: {
            slug: dest.raw.slug,
            name: dest.raw.name,
            state: dest.raw.state,
            distance_km: dest.distance_km,
            imageUrl: imgUrl,
            min_days: dest.min_days,
            description: dest.raw.description || '',
            category: dest.raw.category || '',
            understand_brief: (sb.understand && sb.understand.brief) || '',
            see_brief: (sb.see && sb.see.brief) || ''
          }
        };
        var didAddDest = false;
        if (existing >= 0) {
          if (trips[existing].destination && trips[existing].destination.slug === slug) {
            trips.splice(existing, 1);
          } else {
            trips[existing] = entry2;
            didAddDest = true;
          }
        } else {
          trips.push(entry2);
          didAddDest = true;
        }
        setConfirmedTrips(trips);
        renderWindows();
        renderDestinations();
        if (didAddDest) showPlanToast(dest.raw.name, w.name);
      });
    });
  }

  function getConfirmedTrips() {
    try {
      return JSON.parse(localStorage.getItem(CONFIRMED_TRIPS_KEY) || '[]');
    } catch (e) { return []; }
  }

  function setConfirmedTrips(trips) {
    localStorage.setItem(CONFIRMED_TRIPS_KEY, JSON.stringify(trips));
  }

  var _planToastTimer = null;
  function showPlanToast(destName, windowName) {
    var toast = document.getElementById('planToast');
    if (!toast) return;
    var titleEl = document.getElementById('planToastTitle');
    var textEl = document.getElementById('planToastText');
    if (titleEl) {
      titleEl.textContent = destName ? (destName + ' saved') : 'Trip saved';
    }
    if (textEl) {
      var safeWin = windowName ? String(windowName).replace(/</g, '&lt;') : '';
      textEl.innerHTML = safeWin
        ? 'Locked in for <strong>' + safeWin + '</strong>. Head to <strong>Trips</strong> to customize.'
        : 'Head to <strong>Trips</strong> to customize this plan.';
    }
    toast.hidden = false;
    requestAnimationFrame(function () { toast.classList.add('plan-toast--show'); });
    if (_planToastTimer) clearTimeout(_planToastTimer);
    _planToastTimer = setTimeout(hidePlanToast, 6000);
  }
  function hidePlanToast() {
    var toast = document.getElementById('planToast');
    if (!toast) return;
    toast.classList.remove('plan-toast--show');
    if (_planToastTimer) { clearTimeout(_planToastTimer); _planToastTimer = null; }
    setTimeout(function () { if (!toast.classList.contains('plan-toast--show')) toast.hidden = true; }, 250);
  }

  function syncConfirmedTripsToWindows() {
    var trips = getConfirmedTrips();
    if (!trips.length) return;
    var activeStarts = {};
    allWindows.forEach(function (w) { activeStarts[w.start] = true; });
    var cleaned = trips.filter(function (t) { return !!activeStarts[t.windowStart]; });
    if (cleaned.length !== trips.length) {
      setConfirmedTrips(cleaned);
    }
  }

  function renderDestinations() {
    var grid = document.getElementById('planDestGrid');
    var loading = document.getElementById('planDestLoading');
    var destSection = document.querySelector('.plan-destinations');
    if (!grid) return;

    var sel = getPlanSelected();
    var hasSelectedWindow = sel && allWindows.some(function (w) { return w.start === sel; });

    if (!hasSelectedWindow || allWindows.length === 0) {
      if (destSection) destSection.style.display = 'none';
      return;
    }

    if (destSection) destSection.style.display = '';

    var showHometown = !!(currentUser && hasDistinctHometown(currentUser));
    var homeParsed = showHometown ? parseHomeLocation(currentUser) : null;
    if (showHometown && !homeParsed) showHometown = false;

    var confirmed = getConfirmedTrips();
    var confirmedForCurrent = confirmed.find(function (t) { return t.windowStart === sel; });
    var selectedSlug = confirmedForCurrent && confirmedForCurrent.destination ? confirmedForCurrent.destination.slug : null;

    var hometownHtml = (showHometown && homeParsed)
      ? renderHometownCard(homeParsed, selectedSlug === HOMETOWN_SLUG)
      : '';

    if (scoredDestinations.length === 0) {
      if (!showHometown || !homeParsed) {
        grid.innerHTML = '<div class="plan-dest-loading" id="planDestLoading">Loading destinations…</div>';
        return;
      }
      grid.innerHTML = hometownHtml +
        '<div class="plan-dest-loading plan-dest-loading--inline" id="planDestLoading">Loading destinations…</div>';
      wirePlanDestCardClicks(sel);
      return;
    }

    if (loading) loading.style.display = 'none';

    var confirmedSlugs = confirmed.map(function (t) { return t.destination && t.destination.slug; }).filter(Boolean);
    var filtered = scoredDestinations.filter(function (d) {
      if (d.visited) return false;
      return confirmedSlugs.indexOf(d.raw.slug) === -1 || d.raw.slug === selectedSlug;
    });
    var toShow = filtered.slice(0, destVisibleCount);
    var moreCount = filtered.length - destVisibleCount;
    var html = hometownHtml + toShow.map(function (dest) {
      return renderDestCard(dest, selectedSlug === dest.raw.slug);
    }).join('');

    if (moreCount > 0) {
      var moreLabel = moreCount >= 50 ? '50+' : moreCount + '+';
      html += '<button type="button" class="plan-explore-btn plan-explore-btn--card" id="planExploreMore">' +
        '<span>Explore ' + moreLabel + ' More</span>' +
        '<span class="material-symbols-outlined">arrow_forward</span></button>';
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.plan-dest-menu-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.plan-dest-card');
        var menu = card && card.querySelector('.plan-dest-menu');
        if (!menu) return;
        var willOpen = !!menu.hidden;
        closeAllPlanMenus();
        menu.hidden = !willOpen;
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    });

    grid.querySelectorAll('.plan-dest-menu-item[data-action="visit"]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        var slug = item.getAttribute('data-slug');
        var dest = scoredDestinations.find(function (x) { return x.raw.slug === slug; });
        closeAllPlanMenus();
        if (!dest) return;
        setDestinationVisited(dest, true);
        refreshVisitedFlags();
        renderDestinations();
      });
    });

    grid.querySelectorAll('.plan-dest-fav').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var slug = btn.getAttribute('data-slug');
        var dest = scoredDestinations.find(function (x) { return x.raw.slug === slug; });
        if (!dest) return;
        var favs = getPlanFavorites();
        var existIdx = favs.findIndex(function (f) { return f.destination && f.destination.slug === slug; });
        if (existIdx >= 0) {
          favs.splice(existIdx, 1);
          btn.classList.remove('plan-dest-fav--active');
          btn.querySelector('.material-symbols-outlined').textContent = 'favorite_border';
        } else {
          var w = allWindows.find(function (x) { return x.start === sel; });
          var imgUrl = (dest.raw.images && dest.raw.images[0] && dest.raw.images[0].url) || '';
          favs.push({
            windowStart: w ? w.start : '',
            windowEnd: w ? w.end : '',
            windowName: w ? w.name : '',
            windowType: w ? w.type : '',
            windowDays: w ? w.days : 0,
            leaves: w ? (w.leaves || 0) : 0,
            destination: {
              slug: dest.raw.slug,
              name: dest.raw.name,
              state: dest.raw.state,
              imageUrl: imgUrl,
              category: dest.raw.category || ''
            }
          });
          btn.classList.add('plan-dest-fav--active');
          btn.querySelector('.material-symbols-outlined').textContent = 'favorite';
        }
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
      });
    });

    wirePlanDestCardClicks(sel);

    var exploreBtn = document.getElementById('planExploreMore');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', function () {
        destVisibleCount = filtered.length;
        renderDestinations();
      });
    }
  }

  function loadAndScoreDestinations(user) {
    var prefs = getTravelPrefs();
    var userCoords = getUserCoords(user);
    var availableDays = getAvailableDays();
    var sel = getPlanSelected();
    var tripMonth = null;
    if (sel) {
      var w = allWindows.find(function (x) { return x.start === sel; });
      if (w && w.start) {
        var parts = w.start.split('-');
        if (parts[0] && parts[1]) tripMonth = parseInt(parts[1], 10);
      }
    }
    if (!tripMonth) tripMonth = new Date().getMonth() + 1;

    var visitedList = getVisitedPlaces();
    scoredDestinations = allDestinations.filter(function (d) { return !isUserHomeCity(d, user); }).map(function (d) {
      var result = scoreDestination(d, userCoords, prefs, availableDays, tripMonth);
      var tags = deriveTags(d, prefs.hasKidsUnder10, tripMonth);
      var richness = (d.ranking_signals && d.ranking_signals.content_richness_score) != null
        ? d.ranking_signals.content_richness_score
        : 0.3;
      return {
        raw: d,
        score: result.score,
        distance_km: result.distance_km,
        min_days: result.min_days,
        tags: tags,
        hasKids: prefs.hasKidsUnder10,
        isCouple: !prefs.hasKidsUnder10,
        content_richness: richness,
        visited: isDestinationVisited(d, visitedList)
      };
    }).filter(function (x) { return x.raw.name; }).sort(function (a, b) {
      if (a.visited !== b.visited) return a.visited ? 1 : -1;
      var diff = (b.score || 0) - (a.score || 0);
      if (diff !== 0) return diff;
      return (b.content_richness || 0) - (a.content_richness || 0);
    });

    destVisibleCount = INITIAL_DEST_COUNT;
    renderDestinations();
  }

  function fetchRecommendationData(user) {
    var configUrl = '../database/recommendation/config.json?t=' + Date.now();
    var scUrl = '../database/state-city/data.json';
    var destUrls = ['../database/destinations/in/Karnataka.json', '../database/destinations/in/Kerala.json', '../database/destinations/in/Tamil_Nadu.json', '../database/destinations/in/Andhra_Pradesh.json', '../database/destinations/in/Telangana.json', '../database/destinations/in/Puducherry.json', '../database/destinations/in/Lakshadweep.json'];

    Promise.all([
      fetch(configUrl, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch(scUrl).then(function (r) { return r.ok ? r.json() : { states: [] }; }).catch(function () { return { states: [] }; }),
      Promise.all(destUrls.map(function (u) {
        return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      }))
    ]).then(function (results) {
      recConfig = results[0] || {};
      stateCityData = results[1] || { states: [] };
      allDestinations = [];
      (results[2] || []).forEach(function (data) {
        if (data && data.destinations && Array.isArray(data.destinations)) {
          data.destinations.forEach(function (d) {
            if (d.name && d.slug) allDestinations.push(d);
          });
        }
      });
      loadAndScoreDestinations(user);
    }).catch(function () {
      var loading = document.getElementById('planDestLoading');
      if (loading) loading.textContent = 'Could not load destinations. Try opening via a local server (e.g. npx serve).';
    });
  }

  function init() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { window.location.href = '../index.html'; return; }
    var user = JSON.parse(raw);
    if (!user.name && !user.workLocation) { window.location.href = '../index.html'; return; }
    currentUser = user;
    allWindows = buildAllWindows();
    syncConfirmedTripsToWindows();
    var sel = getPlanSelected();
    if (!sel && allWindows.length) {
      setPlanSelected(allWindows[0].start);
    }
    if (sel && !allWindows.some(function (w) { return w.start === sel; })) {
      localStorage.removeItem(PLAN_SELECTED_KEY);
    }
    updateUI();
    wireFilterPills();
    wireSearch();
    if (allWindows.length) {
      fetchRecommendationData(user);
    } else {
      renderDestinations();
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('.plan-dest-menu') || e.target.closest('.plan-dest-menu-btn')) return;
      closeAllPlanMenus();
    });

    var toastClose = document.getElementById('planToastClose');
    if (toastClose) toastClose.addEventListener('click', hidePlanToast);
    var toastCta = document.getElementById('planToastCta');
    if (toastCta) toastCta.addEventListener('click', hidePlanToast);

    window.addEventListener('planPrefsDone', function () {
      if (currentUser && allDestinations.length) loadAndScoreDestinations(currentUser);
    });

    window.addEventListener('storage', function (e) {
      if ((e.key === TRAVEL_PREFS_KEY || e.key === VISITED_PLACES_KEY) && currentUser && allDestinations.length) {
        loadAndScoreDestinations(currentUser);
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        allWindows = buildAllWindows();
        syncConfirmedTripsToWindows();
        updateUI();
        if (currentUser && allDestinations.length) loadAndScoreDestinations(currentUser);
      }
    });
  }

  init();
})();
