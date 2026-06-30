document.addEventListener('DOMContentLoaded', function () {
  var DB_NAME = 'doggy_daycare_scheduler';
  var DB_VERSION = 1;
  var STORE_NAME = 'scheduler_data';
  var STORE_KEY = 'appointments';
  var APPOINTMENT_STATUSES = ['Requested', 'Confirmed', 'Completed', 'Cancelled'];
  var ACTION_TO_STATUS_MAP = {
    confirm: 'Confirmed',
    cancel: 'Cancelled',
    complete: 'Completed'
  };
  var memoryFallback = [];
  var fallbackCounter = 0;
  var dbPromise = null;

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        resolve(null);
        return;
      }

      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        resolve(null);
      };
    });
    return dbPromise;
  }

  function readFromStore(db) {
    return new Promise(function (resolve) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var request = store.get(STORE_KEY);
      request.onsuccess = function () {
        var result = request.result;
        resolve(Array.isArray(result) ? result : []);
      };
      request.onerror = function () {
        resolve([]);
      };
    });
  }

  function writeToStore(db, appointments) {
    return new Promise(function (resolve) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      store.put(appointments, STORE_KEY);
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        resolve();
      };
    });
  }

  async function readAppointments() {
    var db = await openDatabase();
    if (!db) return memoryFallback.slice();
    return readFromStore(db);
  }

  async function writeAppointments(appointments) {
    var db = await openDatabase();
    if (!db) {
      memoryFallback = appointments.slice();
      return;
    }
    await writeToStore(db, appointments);
  }

  function sortAppointments(appointments) {
    return appointments.sort(function (a, b) {
      var aKey = (a.date || '') + 'T' + (a.startTime || '');
      var bKey = (b.date || '') + 'T' + (b.startTime || '');
      return aKey.localeCompare(bKey);
    });
  }

  function buildId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    fallbackCounter += 1;
    var seed = String(Date.now()) + '-' + String(fallbackCounter) + '-' + Math.random().toString(36).slice(2);
    return seed;
  }

  function isCancelableStatus(status) {
    return status === 'Requested' || status === 'Confirmed';
  }

  function toMinutes(timeString) {
    var match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeString || '');
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  async function updateAppointment(id, updater) {
    var appointments = await readAppointments();
    var changed = false;
    for (var i = 0; i < appointments.length; i += 1) {
      if (appointments[i].id === id) {
        appointments[i] = updater(appointments[i]);
        changed = true;
        break;
      }
    }
    if (changed) {
      await writeAppointments(appointments);
    }
    return changed;
  }

  async function removeAppointment(id) {
    var appointments = await readAppointments();
    var filtered = appointments.filter(function (item) {
      return item.id !== id;
    });
    if (filtered.length !== appointments.length) {
      await writeAppointments(filtered);
      return true;
    }
    return false;
  }

  function createStatusBadge(status) {
    var safeStatus = APPOINTMENT_STATUSES.indexOf(status) >= 0 ? status : 'Requested';
    var token = safeStatus.toLowerCase();
    return '<span class="status-badge status-' + token + '">' + safeStatus + '</span>';
  }

  function isValidTimeRange(startTime, endTime) {
    var startMinutes = toMinutes(startTime);
    var endMinutes = toMinutes(endTime);
    return startMinutes !== null && endMinutes !== null && startMinutes < endMinutes;
  }

  function initOwnerPortal() {
    var form = document.getElementById('appointment-form');
    if (!form) return;

    var statusNode = document.getElementById('owner-form-status');
    var bodyNode = document.getElementById('owner-appointments-body');
    var emptyNode = document.getElementById('owner-appointments-empty');

    async function renderOwnerRows() {
      var appointments = sortAppointments(await readAppointments());
      if (!bodyNode) return;
      if (!appointments.length) {
        bodyNode.innerHTML = '';
        if (emptyNode) emptyNode.style.display = 'block';
        return;
      }
      if (emptyNode) emptyNode.style.display = 'none';
      bodyNode.innerHTML = appointments
        .map(function (item) {
          var canCancel = isCancelableStatus(item.status);
          return (
            '<tr>' +
            '<td>' + item.date + '</td>' +
            '<td>' + item.startTime + ' - ' + item.endTime + '</td>' +
            '<td>' + item.dog + '</td>' +
            '<td>' + item.service + '</td>' +
            '<td>' + createStatusBadge(item.status) + '</td>' +
            '<td class="actions-cell">' +
            (canCancel ? '<button type="button" data-action="cancel-owner" data-id="' + item.id + '">Cancel</button>' : '') +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var owner = String(data.get('owner') || '').trim();
      var dog = String(data.get('dog') || '').trim();
      var service = String(data.get('service') || '').trim();
      var date = String(data.get('date') || '').trim();
      var startTime = String(data.get('startTime') || '').trim();
      var endTime = String(data.get('endTime') || '').trim();
      var notes = String(data.get('notes') || '').trim();

      if (!owner || !dog || !service || !date || !startTime || !endTime) {
        if (statusNode) statusNode.textContent = 'Please complete all required fields.';
        return;
      }

      if (!isValidTimeRange(startTime, endTime)) {
        if (statusNode) statusNode.textContent = 'End time must be after start time.';
        return;
      }

      var appointments = await readAppointments();
      appointments.push({
        id: buildId(),
        owner: owner,
        dog: dog,
        service: service,
        date: date,
        startTime: startTime,
        endTime: endTime,
        notes: notes,
        status: 'Requested'
      });
      await writeAppointments(appointments);
      form.reset();
      if (statusNode) statusNode.textContent = 'Appointment request submitted.';
      await renderOwnerRows();
    });

    if (bodyNode) {
      bodyNode.addEventListener('click', async function (event) {
        var target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;
        var action = target.getAttribute('data-action');
        var id = target.getAttribute('data-id');
        if (!id || action !== 'cancel-owner') return;
        var changed = await updateAppointment(id, function (item) {
          if (item.status === 'Requested' || item.status === 'Confirmed') {
            item.status = 'Cancelled';
          }
          return item;
        });
        if (changed) {
          await renderOwnerRows();
          if (statusNode) statusNode.textContent = 'Appointment cancelled.';
        }
      });
    }

    renderOwnerRows();
  }

  function initAdminPanel() {
    var tableBody = document.getElementById('admin-appointments-body');
    if (!tableBody) return;

    var summaryNode = document.getElementById('admin-summary');
    var emptyNode = document.getElementById('admin-appointments-empty');
    var dateFilter = document.getElementById('admin-filter-date');
    var statusFilter = document.getElementById('admin-filter-status');

    function updateSummary(totalCount, filteredCount, activeCount) {
      if (!summaryNode) return;
      if (!totalCount) {
        summaryNode.textContent = 'No appointments scheduled.';
        return;
      }
      summaryNode.textContent = totalCount + ' total appointment(s), ' + filteredCount + ' shown, ' + activeCount + ' active request(s).';
    }

    async function getFilteredAppointments() {
      var appointments = sortAppointments(await readAppointments());
      var filterDate = dateFilter ? dateFilter.value : '';
      var filterStatus = statusFilter ? statusFilter.value : 'all';
      return appointments.filter(function (item) {
        if (filterDate && item.date !== filterDate) return false;
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        return true;
      });
    }

    async function renderAdminRows() {
      var allAppointments = sortAppointments(await readAppointments());
      var filtered = await getFilteredAppointments();
      var activeCount = allAppointments.filter(function (item) {
        return item.status === 'Requested' || item.status === 'Confirmed';
      }).length;
      updateSummary(allAppointments.length, filtered.length, activeCount);
      if (!filtered.length) {
        tableBody.innerHTML = '';
        if (emptyNode) emptyNode.style.display = 'block';
        return;
      }
      if (emptyNode) emptyNode.style.display = 'none';
      tableBody.innerHTML = filtered
        .map(function (item) {
          var actions = [];
          if (item.status === 'Requested') actions.push('<button type="button" data-action="confirm" data-id="' + item.id + '">Confirm</button>');
          if (isCancelableStatus(item.status)) actions.push('<button type="button" data-action="cancel" data-id="' + item.id + '">Cancel</button>');
          if (item.status === 'Confirmed') actions.push('<button type="button" data-action="complete" data-id="' + item.id + '">Complete</button>');
          actions.push('<button type="button" data-action="delete" data-id="' + item.id + '">Delete</button>');

          return (
            '<tr>' +
            '<td>' + item.date + '</td>' +
            '<td>' + item.startTime + ' - ' + item.endTime + '</td>' +
            '<td>' + item.owner + '</td>' +
            '<td>' + item.dog + '</td>' +
            '<td>' + item.service + '</td>' +
            '<td>' + createStatusBadge(item.status) + '</td>' +
            '<td class="actions-cell">' + actions.join('') + '</td>' +
            '</tr>'
          );
        })
        .join('');
    }

    tableBody.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (!id || !action) return;

      if (action === 'delete') {
        await removeAppointment(id);
        await renderAdminRows();
        return;
      }

      var nextStatus = ACTION_TO_STATUS_MAP[action];
      if (!nextStatus) return;
      await updateAppointment(id, function (item) {
        item.status = nextStatus;
        return item;
      });
      await renderAdminRows();
    });

    if (dateFilter) dateFilter.addEventListener('change', renderAdminRows);
    if (statusFilter) statusFilter.addEventListener('change', renderAdminRows);
    renderAdminRows();
  }

  initOwnerPortal();
  initAdminPanel();
});
