document.addEventListener('DOMContentLoaded', function () {
  var STORAGE_KEY = 'doggy_daycare_appointments_v1';
  var APPOINTMENT_STATUSES = ['Requested', 'Confirmed', 'Completed', 'Cancelled'];

  function readAppointments() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeAppointments(appointments) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  }

  function sortAppointments(appointments) {
    return appointments.sort(function (a, b) {
      var aKey = (a.date || '') + 'T' + (a.startTime || '');
      var bKey = (b.date || '') + 'T' + (b.startTime || '');
      return aKey.localeCompare(bKey);
    });
  }

  function updateAppointment(id, updater) {
    var appointments = readAppointments();
    var changed = false;
    for (var i = 0; i < appointments.length; i += 1) {
      if (appointments[i].id === id) {
        appointments[i] = updater(appointments[i]);
        changed = true;
        break;
      }
    }
    if (changed) {
      writeAppointments(appointments);
    }
    return changed;
  }

  function removeAppointment(id) {
    var appointments = readAppointments();
    var filtered = appointments.filter(function (item) {
      return item.id !== id;
    });
    if (filtered.length !== appointments.length) {
      writeAppointments(filtered);
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
    return Boolean(startTime && endTime && startTime < endTime);
  }

  function initOwnerPortal() {
    var form = document.getElementById('appointment-form');
    if (!form) return;

    var statusNode = document.getElementById('owner-form-status');
    var bodyNode = document.getElementById('owner-appointments-body');
    var emptyNode = document.getElementById('owner-appointments-empty');

    function renderOwnerRows() {
      var appointments = sortAppointments(readAppointments());
      if (!bodyNode) return;
      if (!appointments.length) {
        bodyNode.innerHTML = '';
        if (emptyNode) emptyNode.style.display = 'block';
        return;
      }
      if (emptyNode) emptyNode.style.display = 'none';
      bodyNode.innerHTML = appointments
        .map(function (item) {
          var canCancel = item.status === 'Requested' || item.status === 'Confirmed';
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

    form.addEventListener('submit', function (event) {
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

      var appointments = readAppointments();
      appointments.push({
        id: String(Date.now()) + '-' + Math.random().toString(16).slice(2),
        owner: owner,
        dog: dog,
        service: service,
        date: date,
        startTime: startTime,
        endTime: endTime,
        notes: notes,
        status: 'Requested',
        createdAt: new Date().toISOString()
      });
      writeAppointments(appointments);
      form.reset();
      if (statusNode) statusNode.textContent = 'Appointment request submitted.';
      renderOwnerRows();
    });

    if (bodyNode) {
      bodyNode.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLButtonElement)) return;
        var action = target.getAttribute('data-action');
        var id = target.getAttribute('data-id');
        if (!id || action !== 'cancel-owner') return;
        var changed = updateAppointment(id, function (item) {
          if (item.status === 'Requested' || item.status === 'Confirmed') {
            item.status = 'Cancelled';
          }
          return item;
        });
        if (changed) {
          renderOwnerRows();
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

    function updateSummary(appointments) {
      if (!summaryNode) return;
      if (!appointments.length) {
        summaryNode.textContent = 'No appointments scheduled.';
        return;
      }
      var activeCount = appointments.filter(function (item) {
        return item.status === 'Requested' || item.status === 'Confirmed';
      }).length;
      summaryNode.textContent = appointments.length + ' appointment(s), ' + activeCount + ' active request(s).';
    }

    function getFilteredAppointments() {
      var appointments = sortAppointments(readAppointments());
      var filterDate = dateFilter ? dateFilter.value : '';
      var filterStatus = statusFilter ? statusFilter.value : 'all';
      return appointments.filter(function (item) {
        if (filterDate && item.date !== filterDate) return false;
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        return true;
      });
    }

    function renderAdminRows() {
      var filtered = getFilteredAppointments();
      updateSummary(filtered);
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
          if (item.status === 'Requested' || item.status === 'Confirmed') actions.push('<button type="button" data-action="cancel" data-id="' + item.id + '">Cancel</button>');
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

    tableBody.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      var action = target.getAttribute('data-action');
      var id = target.getAttribute('data-id');
      if (!id || !action) return;

      if (action === 'delete') {
        removeAppointment(id);
        renderAdminRows();
        return;
      }

      var actionToStatus = {
        confirm: 'Confirmed',
        cancel: 'Cancelled',
        complete: 'Completed'
      };
      var nextStatus = actionToStatus[action];
      if (!nextStatus) return;
      updateAppointment(id, function (item) {
        item.status = nextStatus;
        return item;
      });
      renderAdminRows();
    });

    if (dateFilter) dateFilter.addEventListener('change', renderAdminRows);
    if (statusFilter) statusFilter.addEventListener('change', renderAdminRows);
    renderAdminRows();
  }

  initOwnerPortal();
  initAdminPanel();
});
