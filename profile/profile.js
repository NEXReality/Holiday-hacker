(function () {
  'use strict';

  var STORAGE_KEY = 'holidayHacker_user';
  var CAL_DONE_KEY = 'holidayHacker_calSetup';
  var TRAVEL_PREFS_KEY = 'holidayHacker_travelPreferences';

  var raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.location.href = '../index.html';
    return;
  }
  var user = JSON.parse(raw);
  if (!user.name && !user.workLocation) {
    window.location.href = '../index.html';
    return;
  }
  if (!localStorage.getItem(CAL_DONE_KEY)) {
    window.location.href = '../calendar/index.html';
    return;
  }

  var profileName = document.getElementById('profileName');
  var nameInput = document.getElementById('profile-name-input');
  var ageInput = document.getElementById('profile-age');
  var genderInput = document.getElementById('profile-gender');
  var workInput = document.getElementById('profile-work');
  var homeInput = document.getElementById('profile-home');
  var lastUpdatedEl = document.getElementById('profileLastUpdated');
  var saveBtn = document.getElementById('profileSaveBtn');
  var saveBtnText = document.getElementById('profileSaveBtnText');
  var saveBtnIcon = document.getElementById('profileSaveBtnIcon');

  var leavesSlider  = document.getElementById('profile-leaves');
  var leavesPill    = document.querySelector('.profile-quota-pill');

  var editableFields = [nameInput, ageInput, genderInput, workInput, homeInput];
  var isEditing = false;
  var hasChanges = false;

  var familyDisplay = document.getElementById('profileFamilyDisplay');
  var familyEdit = document.getElementById('profileFamilyEdit');
  var familyLeft = document.querySelector('.profile-family-left');
  var adultsVal = document.getElementById('profileAdultsVal');
  var childrenVal = document.getElementById('profileChildrenVal');

  /* ---- Family size (from chat / editable) ---- */

  function deriveFamilyFromPrefs(p) {
    if (typeof p.adults === 'number' && typeof p.children === 'number') {
      return { adults: Math.max(1, p.adults), children: Math.max(0, p.children) };
    }
    var party = p.travelParty || 'solo';
    var hasKids = !!p.hasKidsUnder10;
    if (party === 'solo') return { adults: 1, children: 0 };
    if (party === 'couple') return { adults: 2, children: 0 };
    if (party === 'family') return { adults: 2, children: hasKids ? 1 : 0 };
    if (party === 'group') return { adults: 4, children: 0 };
    return { adults: 2, children: 0 };
  }

  function formatFamilyDisplay(adults, children) {
    if (children === 0) return adults + ' Adult' + (adults > 1 ? 's' : '');
    return adults + ' Adult' + (adults > 1 ? 's' : '') + ', ' + children + ' Child' + (children > 1 ? 'ren' : '');
  }

  function loadFamilySize() {
    var p = getTravelPrefs();
    var fam = deriveFamilyFromPrefs(p);
    if (familyDisplay) familyDisplay.textContent = formatFamilyDisplay(fam.adults, fam.children);
    if (adultsVal) adultsVal.textContent = String(fam.adults);
    if (childrenVal) childrenVal.textContent = String(fam.children);
  }

  function saveFamilySize() {
    var adults = Math.max(1, parseInt(adultsVal ? adultsVal.textContent : 2, 10) || 2);
    var children = Math.max(0, parseInt(childrenVal ? childrenVal.textContent : 0, 10) || 0);
    var p = getTravelPrefs();
    p.adults = adults;
    p.children = children;
    p.hasKidsUnder10 = children > 0;
    saveTravelPrefs(p);
  }

  /* ---- Populate from localStorage ---- */

  function loadData() {
    if (user.name) {
      profileName.textContent = user.name;
      nameInput.value = user.name;
    }
    if (user.ageGroup) ageInput.value = user.ageGroup;
    if (user.gender) genderInput.value = user.gender;
    if (user.workLocation) workInput.value = user.workLocation;
    if (user.homeLocation) homeInput.value = user.homeLocation;

    if (typeof user.pendingLeaves === 'number') {
      leavesSlider.value = user.pendingLeaves;
      leavesPill.textContent = user.pendingLeaves + ' Days';
    }

    updateLastUpdated();
  }

  /* ---- Last updated formatting ---- */

  function formatLastUpdated() {
    if (!user.lastUpdated) return '';
    var d = new Date(user.lastUpdated);
    var now = new Date();
    var isToday = d.getFullYear() === now.getFullYear() &&
                  d.getMonth() === now.getMonth() &&
                  d.getDate() === now.getDate();

    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    var timeStr = h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;

    if (isToday) {
      return 'Today, ' + timeStr;
    }
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function updateLastUpdated() {
    var text = formatLastUpdated();
    lastUpdatedEl.textContent = text ? 'Last updated: ' + text : '';
  }

  /* ---- Edit / Save toggle ---- */

  function enterEditMode() {
    isEditing = true;
    hasChanges = false;
    editableFields.forEach(function (el) {
      if (el) el.removeAttribute('readonly');
    });
    if (familyLeft) familyLeft.style.display = 'none';
    if (familyEdit) familyEdit.style.display = 'flex';
    saveBtnText.textContent = 'Save Changes';
    saveBtnIcon.textContent = 'check';
    saveBtn.classList.add('profile-save-btn--editing');
  }

  function exitEditMode() {
    isEditing = false;
    hasChanges = false;
    editableFields.forEach(function (el) {
      if (el) el.setAttribute('readonly', '');
    });
    if (familyLeft) familyLeft.style.display = '';
    if (familyEdit) familyEdit.style.display = 'none';
    loadFamilySize();
    saveBtnText.textContent = 'Edit Profile';
    saveBtnIcon.textContent = 'edit';
    saveBtn.classList.remove('profile-save-btn--editing');
  }

  function saveProfile() {
    user.name = nameInput.value.trim() || user.name;
    user.ageGroup = ageInput.value.trim();
    user.gender = genderInput.value.trim();
    user.workLocation = workInput.value.trim();
    user.homeLocation = homeInput.value.trim();
    user.pendingLeaves = parseInt(leavesSlider.value, 10);
    user.lastUpdated = new Date().toISOString();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    saveFamilySize();

    profileName.textContent = user.name;
    leavesPill.textContent = user.pendingLeaves + ' Days';
    updateLastUpdated();
    exitEditMode();
  }

  saveBtn.addEventListener('click', function () {
    if (isEditing) {
      saveProfile();
    } else {
      enterEditMode();
    }
  });

  /* ---- Track changes ---- */

  editableFields.forEach(function (el) {
    if (el) {
      el.addEventListener('input', function () {
        if (isEditing) hasChanges = true;
      });
    }
  });

  /* ---- Unsaved-changes guard ---- */

  function confirmLeave() {
    return confirm('You have unsaved changes. Leave without saving?');
  }

  window.addEventListener('beforeunload', function (e) {
    if (hasChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  document.querySelectorAll('.glass-nav .nav-item').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (hasChanges) {
        if (!confirmLeave()) {
          e.preventDefault();
        }
      }
    });
  });

  /* ---- Leaves slider live update ---- */
  leavesSlider.addEventListener('input', function () {
    leavesPill.textContent = leavesSlider.value + ' Days';
    if (isEditing) hasChanges = true;
  });

  /* ---- Travel & Recommendation Preferences ---- */

  function getTravelPrefs() {
    try {
      return JSON.parse(localStorage.getItem(TRAVEL_PREFS_KEY) || '{}');
    } catch (e) { return {}; }
  }

  function saveTravelPrefs(prefs) {
    localStorage.setItem(TRAVEL_PREFS_KEY, JSON.stringify(prefs));
  }

  function loadTravelPrefs() {
    var p = getTravelPrefs();
    var modes = p.travelModes || (p.travelMode ? [p.travelMode] : ['car']);
    document.querySelectorAll('#profileTravelModes .profile-mode-btn').forEach(function (btn) {
      var m = btn.getAttribute('data-mode');
      var active = modes.indexOf(m) !== -1;
      btn.classList.toggle('profile-mode-btn--active', active);
      btn.classList.toggle('profile-mode-btn--inactive', !active);
    });
    var segs = p.destinationSegments || [];
    document.querySelectorAll('#profileDestinationSegments input[data-segment]').forEach(function (cb) {
      cb.checked = segs.indexOf(cb.getAttribute('data-segment')) !== -1;
    });
    var kidsEl = document.getElementById('profileHasKidsUnder10');
    if (kidsEl) kidsEl.checked = !!p.hasKidsUnder10;
  }

  document.querySelectorAll('#profileTravelModes .profile-mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = getTravelPrefs();
      var modes = p.travelModes || ['car'];
      var m = btn.getAttribute('data-mode');
      var idx = modes.indexOf(m);
      if (idx !== -1) {
        if (modes.length <= 1) return;
        modes.splice(idx, 1);
      } else {
        modes.push(m);
      }
      p.travelModes = modes;
      saveTravelPrefs(p);
      loadTravelPrefs();
    });
  });

  document.querySelectorAll('#profileDestinationSegments input[data-segment]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var p = getTravelPrefs();
      var segs = p.destinationSegments || [];
      var s = cb.getAttribute('data-segment');
      var idx = segs.indexOf(s);
      if (cb.checked) {
        if (idx === -1) segs.push(s);
      } else {
        if (idx !== -1) segs.splice(idx, 1);
      }
      p.destinationSegments = segs;
      saveTravelPrefs(p);
    });
  });

  var kidsCheck = document.getElementById('profileHasKidsUnder10');
  if (kidsCheck) kidsCheck.addEventListener('change', function () {
    var p = getTravelPrefs();
    p.hasKidsUnder10 = kidsCheck.checked;
    saveTravelPrefs(p);
  });

  /* ---- Clear Data ---- */
  var btnClearRec = document.getElementById('profileClearRecommendation');
  var btnClearPersonal = document.getElementById('profileClearPersonal');
  var btnClearCalendar = document.getElementById('profileClearCalendar');
  if (btnClearRec) btnClearRec.addEventListener('click', function () {
    if (!confirm('Clear travel modes, destination preferences, and recommendation data? Plan page will use defaults until you set them again.')) return;
    localStorage.removeItem(TRAVEL_PREFS_KEY);
    localStorage.removeItem('holidayHacker_planPrefsDone');
    localStorage.removeItem('holidayHacker_planSelectedDestination');
    loadTravelPrefs();
    loadFamilySize();
  });
  if (btnClearPersonal) btnClearPersonal.addEventListener('click', function () {
    if (!confirm('Clear all personal data (name, age, location, etc.)? You will need to complete onboarding again.')) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = '../index.html';
  });
  if (btnClearCalendar) btnClearCalendar.addEventListener('click', function () {
    if (!confirm('Clear calendar data? The calendar setup chat will show again on your next visit.')) return;
    localStorage.removeItem(CAL_DONE_KEY);
    localStorage.removeItem('holidayHacker_advisorData');
    localStorage.removeItem('holidayHacker_selectedBridges');
    localStorage.removeItem('holidayHacker_plannedTrips');
    localStorage.removeItem('holidayHacker_advisorSeen');
    window.location.href = '../calendar/index.html';
  });

  /* ---- Family stepper buttons ---- */
  function wireFamilyStepper(btnId, valEl, delta) {
    var btn = document.getElementById(btnId);
    if (!btn || !valEl) return;
    btn.addEventListener('click', function () {
      var n = Math.max(0, parseInt(valEl.textContent, 10) || 0) + delta;
      if (valEl.id === 'profileAdultsVal') n = Math.max(1, n);
      else n = Math.max(0, n);
      valEl.textContent = String(n);
      if (isEditing) hasChanges = true;
    });
  }
  wireFamilyStepper('profileAdultsMinus', adultsVal, -1);
  wireFamilyStepper('profileAdultsPlus', adultsVal, 1);
  wireFamilyStepper('profileChildrenMinus', childrenVal, -1);
  wireFamilyStepper('profileChildrenPlus', childrenVal, 1);

  /* ---- Init ---- */
  loadData();
  loadFamilySize();
  loadTravelPrefs();
})();
