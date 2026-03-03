// ============================================================
// Bazu Time Coder - Podcast Live Timecode Marker App
// ============================================================

(function () {
  'use strict';

  // --- State ---
  let currentProject = null;
  let markers = [];
  let lastMarker = null;
  let selectedColor = 'Orange';
  let pusherClient = null;
  let pusherChannel = null;
  let tcInterval = null;
  let manualTcFocused = false;
  let formTimecode = null; // captured when user clicks into Name/Comment fields
  let checklistItems = []; // template items + per-project checked state
  let checklistTemplate = []; // raw template for settings editor
  let activeFilter = null; // active marker filter label (null = show all)

  // --- DOM refs ---
  const projectListView = document.getElementById('project-list-view');
  const projectView = document.getElementById('project-view');
  const projectListEl = document.getElementById('project-list');
  const newProjectNameInput = document.getElementById('new-project-name');
  const createProjectBtn = document.getElementById('create-project-btn');
  const setupDbBtn = document.getElementById('setup-db-btn');
  const backBtn = document.getElementById('back-btn');
  const timecodeDisplay = document.getElementById('timecode-display');
  const manualTimecodeInput = document.getElementById('manual-timecode');
  const markerNameInput = document.getElementById('marker-name');
  const markerCommentInput = document.getElementById('marker-comment');
  const colorPicker = document.getElementById('color-picker');
  const addMarkerBtn = document.getElementById('add-marker-btn');
  const shortcutButtonsEl = document.getElementById('shortcut-buttons');
  const repeatLastBtn = document.getElementById('repeat-last-btn');
  const projectNameHeader = document.getElementById('project-name-header');
  const markerListEl = document.getElementById('marker-list');
  const exportEdlBtn = document.getElementById('export-edl-btn');
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const editShortcutsBtn = document.getElementById('edit-shortcuts-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const buttonEditorEl = document.getElementById('button-editor');
  const addButtonBtn = document.getElementById('add-button-btn');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const checklistItemsEl = document.getElementById('checklist-items');
  const checklistEditorEl = document.getElementById('checklist-editor');
  const addChecklistItemBtn = document.getElementById('add-checklist-item-btn');
  const markerFilterEl = document.getElementById('marker-filter');

  // --- Timecode ---
  function getCurrentTimecode() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const f = String(Math.floor((now.getMilliseconds()) / 40)).padStart(2, '0');
    return `${h}:${m}:${s}:${f}`;
  }

  function startTimecode() {
    if (tcInterval) clearInterval(tcInterval);
    tcInterval = setInterval(() => {
      const tc = getCurrentTimecode();
      timecodeDisplay.textContent = tc;
      if (!manualTcFocused) {
        manualTimecodeInput.value = tc;
      }
    }, 40); // ~25fps
  }

  function stopTimecode() {
    if (tcInterval) {
      clearInterval(tcInterval);
      tcInterval = null;
    }
  }

  // Get the timecode to use for a new marker
  function captureTimecode() {
    if (manualTcFocused && manualTimecodeInput.value.trim()) {
      return manualTimecodeInput.value.trim();
    }
    return getCurrentTimecode();
  }

  // --- Manual TC focus handling ---
  manualTimecodeInput.addEventListener('focus', () => {
    manualTcFocused = true;
  });

  manualTimecodeInput.addEventListener('blur', () => {
    manualTcFocused = false;
  });

  // --- Form timecode capture ---
  // Snapshot timecode when user first clicks into Name or Comment,
  // so the marker time = when they saw the moment, not when they finish typing.
  function onFormFieldFocus() {
    if (!formTimecode) {
      formTimecode = captureTimecode();
    }
  }

  function onFormFieldBlur() {
    // Small delay so tabbing between Name→Comment doesn't reset the capture
    setTimeout(() => {
      if (document.activeElement !== markerNameInput &&
          document.activeElement !== markerCommentInput) {
        formTimecode = null;
      }
    }, 150);
  }

  markerNameInput.addEventListener('focus', onFormFieldFocus);
  markerCommentInput.addEventListener('focus', onFormFieldFocus);
  markerNameInput.addEventListener('blur', onFormFieldBlur);
  markerCommentInput.addEventListener('blur', onFormFieldBlur);

  // --- API helpers ---
  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || err.details || 'Request failed');
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return res.json();
    }
    return res;
  }

  // --- Pusher ---
  async function initPusher() {
    try {
      const config = await api('/config');
      if (!config.pusherKey) return;

      pusherClient = new Pusher(config.pusherKey, {
        cluster: config.pusherCluster
      });
    } catch (err) {
      console.warn('Pusher init failed:', err);
    }
  }

  function subscribeToPusher(projectId) {
    if (!pusherClient) return;
    unsubscribeFromPusher();

    pusherChannel = pusherClient.subscribe(`project-${projectId}`);

    pusherChannel.bind('marker-added', (marker) => {
      // Don't duplicate if we already have it
      if (!markers.find(m => m.id === marker.id)) {
        markers.unshift(marker);
        renderMarkers();
      }
    });

    pusherChannel.bind('marker-updated', (updated) => {
      const idx = markers.findIndex(m => m.id === updated.id);
      if (idx !== -1) {
        markers[idx] = updated;
        renderMarkers();
      }
    });

    pusherChannel.bind('marker-deleted', (data) => {
      markers = markers.filter(m => m.id !== data.id);
      renderMarkers();
    });
  }

  function unsubscribeFromPusher() {
    if (pusherChannel && pusherClient) {
      pusherClient.unsubscribe(pusherChannel.name);
      pusherChannel = null;
    }
  }

  // --- Projects ---
  async function loadProjects() {
    try {
      const projects = await api('/projects');
      renderProjectList(projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
      projectListEl.innerHTML = '<div class="empty-state">Failed to load projects. Click "Setup DB" first if this is a fresh deployment.</div>';
    }
  }

  function renderProjectList(projects) {
    if (projects.length === 0) {
      projectListEl.innerHTML = '<div class="empty-state">No projects yet. Create one above.</div>';
      return;
    }

    projectListEl.innerHTML = projects.map(p => {
      const date = new Date(p.created_at).toLocaleDateString('en-GB');
      return `
        <div class="project-item" data-id="${p.id}">
          <div>
            <div class="project-name">${escapeHtml(p.name)}</div>
            <div class="project-date">${date}</div>
          </div>
          <button class="project-delete" data-id="${p.id}" title="Delete">&times;</button>
        </div>
      `;
    }).join('');

    // Click to open
    projectListEl.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('project-delete')) return;
        openProject(parseInt(el.dataset.id));
      });
    });

    // Delete buttons
    projectListEl.querySelectorAll('.project-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        if (confirm('Delete this project and all its markers?')) {
          try {
            await api(`/projects/${id}`, { method: 'DELETE' });
            loadProjects();
          } catch (err) {
            alert('Failed to delete: ' + err.message);
          }
        }
      });
    });
  }

  async function createProject() {
    const name = newProjectNameInput.value.trim();
    if (!name) return;
    try {
      const project = await api('/projects', {
        method: 'POST',
        body: { name }
      });
      newProjectNameInput.value = '';
      openProject(project.id);
    } catch (err) {
      alert('Failed to create project: ' + err.message);
    }
  }

  async function openProject(id) {
    try {
      currentProject = await api(`/projects/${id}`);
      markers = await api(`/markers?projectId=${id}`);
      lastMarker = markers.length > 0 ? markers[0] : null;

      projectNameHeader.textContent = currentProject.name;
      renderShortcutButtons();
      renderMarkers();

      // Load checklist state for this project
      try {
        checklistItems = await api(`/checklist/state?projectId=${id}`);
      } catch (err) {
        console.warn('Checklist load failed:', err);
        checklistItems = [];
      }
      renderChecklist();

      projectListView.classList.add('hidden');
      projectView.classList.remove('hidden');

      startTimecode();
      subscribeToPusher(id);
    } catch (err) {
      alert('Failed to open project: ' + err.message);
    }
  }

  function closeProject() {
    stopTimecode();
    unsubscribeFromPusher();
    currentProject = null;
    markers = [];
    checklistItems = [];
    activeFilter = null;

    projectView.classList.add('hidden');
    projectListView.classList.remove('hidden');
    loadProjects();
  }

  // --- Color picker ---
  colorPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedColor = btn.dataset.color;
  });

  // --- Adding markers ---
  async function addMarker(name, color, comment, overrideTimecode) {
    if (!currentProject) return;

    const timecode = overrideTimecode || captureTimecode();
    const markerData = {
      project_id: currentProject.id,
      timecode: timecode,
      color: color || selectedColor,
      name: name || '',
      comment: comment || ''
    };

    try {
      const created = await api('/markers', {
        method: 'POST',
        body: markerData
      });

      // Add locally (Pusher will also fire but we check for dupes)
      if (!markers.find(m => m.id === created.id)) {
        markers.unshift(created);
        renderMarkers();
      }

      lastMarker = created;
      markerNameInput.value = '';
      markerCommentInput.value = '';
    } catch (err) {
      alert('Failed to add marker: ' + err.message);
    }
  }

  addMarkerBtn.addEventListener('click', () => {
    const tc = formTimecode;
    formTimecode = null;
    addMarker(markerNameInput.value.trim(), selectedColor, markerCommentInput.value.trim(), tc);
  });

  // Enter key on comment field
  markerCommentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tc = formTimecode;
      formTimecode = null;
      addMarker(markerNameInput.value.trim(), selectedColor, markerCommentInput.value.trim(), tc);
    }
  });

  // Enter key on name field moves to comment
  markerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      markerCommentInput.focus();
    }
  });

  // Repeat last
  repeatLastBtn.addEventListener('click', () => {
    if (!lastMarker) {
      alert('No previous marker to repeat.');
      return;
    }
    addMarker(lastMarker.name, lastMarker.color, lastMarker.comment);
  });

  // --- Shortcut buttons ---
  function renderShortcutButtons() {
    if (!currentProject) return;

    const buttons = currentProject.buttons || [];
    shortcutButtonsEl.innerHTML = buttons.map((btn, i) => {
      return `<button class="shortcut-btn bg-${btn.color}" data-index="${i}">${escapeHtml(btn.label)}</button>`;
    }).join('');

    shortcutButtonsEl.querySelectorAll('.shortcut-btn').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        const btn = buttons[idx];
        if (btn) {
          addMarker(btn.label, btn.color, '');
        }
      });
    });

    renderFilterBar();
  }

  // --- Filter bar ---
  function renderFilterBar() {
    if (!currentProject) return;

    const buttons = currentProject.buttons || [];
    if (buttons.length === 0) {
      markerFilterEl.innerHTML = '';
      return;
    }

    const allActive = !activeFilter ? 'active' : '';
    let html = `<button class="filter-pill ${allActive}" data-filter="">All</button>`;
    html += buttons.map(btn => {
      const isActive = activeFilter === btn.label ? 'active' : '';
      return `<button class="filter-pill ${isActive}" data-filter="${escapeHtml(btn.label)}">${escapeHtml(btn.label)}</button>`;
    }).join('');

    markerFilterEl.innerHTML = html;

    markerFilterEl.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const filter = pill.dataset.filter;
        if (!filter || activeFilter === filter) {
          activeFilter = null;
        } else {
          activeFilter = filter;
        }
        renderFilterBar();
        renderMarkers();
      });
    });
  }

  // --- Marker list ---
  function renderMarkers() {
    const filtered = activeFilter
      ? markers.filter(m => m.name === activeFilter)
      : markers;

    if (filtered.length === 0) {
      const msg = activeFilter
        ? `No markers matching "${escapeHtml(activeFilter)}".`
        : 'No markers yet. Add one using the form or shortcut buttons.';
      markerListEl.innerHTML = `<div class="empty-state">${msg}</div>`;
      return;
    }

    markerListEl.innerHTML = filtered.map(m => {
      return `
        <div class="marker-row" data-id="${m.id}">
          <span class="marker-tc">${escapeHtml(m.timecode)}</span>
          <span class="marker-dot dot-${m.color}"></span>
          <span class="marker-name">${escapeHtml(m.name || '')}</span>
          <span class="marker-comment" data-id="${m.id}">${escapeHtml(m.comment || '')}</span>
          <button class="marker-edit-btn" data-id="${m.id}" title="Edit">&#9998;</button>
          <button class="marker-delete-btn" data-id="${m.id}" title="Delete">&times;</button>
        </div>
      `;
    }).join('');

    // Edit buttons
    markerListEl.querySelectorAll('.marker-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => startEditMarker(parseInt(btn.dataset.id)));
    });

    // Delete buttons
    markerListEl.querySelectorAll('.marker-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteMarker(parseInt(btn.dataset.id)));
    });
  }

  function startEditMarker(id) {
    const marker = markers.find(m => m.id === id);
    if (!marker) return;

    const commentEl = markerListEl.querySelector(`.marker-comment[data-id="${id}"]`);
    if (!commentEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'marker-comment-input';
    input.value = marker.comment || '';

    commentEl.replaceWith(input);
    input.focus();

    const save = async () => {
      const newComment = input.value.trim();
      try {
        await api(`/markers/${id}`, {
          method: 'PUT',
          body: { comment: newComment }
        });
        marker.comment = newComment;
        renderMarkers();
      } catch (err) {
        alert('Failed to update: ' + err.message);
        renderMarkers();
      }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        renderMarkers();
      }
    });
  }

  async function deleteMarker(id) {
    try {
      await api(`/markers/${id}`, { method: 'DELETE' });
      markers = markers.filter(m => m.id !== id);
      renderMarkers();
    } catch (err) {
      alert('Failed to delete marker: ' + err.message);
    }
  }

  // --- Checklist ---
  function renderChecklist() {
    if (checklistItems.length === 0) {
      checklistItemsEl.innerHTML = '<div class="empty-state" style="padding:20px;font-size:0.8rem;">No checklist items. Add them in Settings.</div>';
      return;
    }

    checklistItemsEl.innerHTML = checklistItems.map(item => {
      const checkedClass = item.checked ? 'checked' : '';
      const markerDot = item.drops_marker
        ? `<span class="checklist-marker-dot dot-${item.color}"></span>`
        : '';
      return `
        <div class="checklist-row ${checkedClass}" data-item-id="${item.id}">
          <span class="checklist-checkbox"></span>
          <span class="checklist-label">${escapeHtml(item.label)}</span>
          ${markerDot}
        </div>
      `;
    }).join('');

    checklistItemsEl.querySelectorAll('.checklist-row').forEach(row => {
      row.addEventListener('click', () => toggleChecklistItem(parseInt(row.dataset.itemId)));
    });
  }

  async function toggleChecklistItem(itemId) {
    if (!currentProject) return;

    const item = checklistItems.find(i => i.id === itemId);
    if (!item) return;

    const newChecked = !item.checked;

    // Optimistic UI update
    item.checked = newChecked;
    renderChecklist();

    try {
      await api('/checklist/state', {
        method: 'PUT',
        body: {
          projectId: currentProject.id,
          checklist_item_id: itemId,
          checked: newChecked
        }
      });

      // If checking (not unchecking) and drops_marker is enabled, add a marker
      if (newChecked && item.drops_marker) {
        addMarker(item.label, item.color, item.label);
      }
    } catch (err) {
      // Revert on failure
      item.checked = !newChecked;
      renderChecklist();
      alert('Failed to update checklist: ' + err.message);
    }
  }

  // --- Exports ---
  exportEdlBtn.addEventListener('click', () => {
    if (!currentProject) return;
    window.open(`/api/export/edl?projectId=${currentProject.id}`, '_blank');
  });

  exportPdfBtn.addEventListener('click', () => {
    if (!currentProject) return;
    window.open(`/api/export/pdf?projectId=${currentProject.id}`, '_blank');
  });

  // --- Settings Modal ---
  editShortcutsBtn.addEventListener('click', () => {
    openSettings();
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add('hidden');
    }
  });

  async function openSettings() {
    if (!currentProject) return;
    renderButtonEditor();

    // Load checklist template
    try {
      checklistTemplate = await api('/checklist/template');
    } catch (err) {
      console.warn('Failed to load checklist template:', err);
      checklistTemplate = [];
    }
    renderChecklistEditor();

    settingsModal.classList.remove('hidden');
  }

  function renderButtonEditor() {
    const buttons = currentProject.buttons || [];
    const colors = ['Orange', 'Blue', 'Purple', 'White', 'Pink', 'Red'];

    buttonEditorEl.innerHTML = buttons.map((btn, i) => {
      const colorOptions = colors.map(c =>
        `<option value="${c}" ${c === btn.color ? 'selected' : ''}>${c}</option>`
      ).join('');

      return `
        <div class="button-editor-row" data-index="${i}">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <button class="btn-move-row" data-dir="up" data-index="${i}" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
            <button class="btn-move-row" data-dir="down" data-index="${i}" ${i === buttons.length - 1 ? 'disabled' : ''}>&darr;</button>
          </div>
          <input type="text" value="${escapeHtml(btn.label)}" placeholder="Label" data-field="label" />
          <select data-field="color">${colorOptions}</select>
          <button class="btn-remove-row" data-index="${i}">&times;</button>
        </div>
      `;
    }).join('');

    // Move buttons
    buttonEditorEl.querySelectorAll('.btn-move-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const dir = btn.dataset.dir;
        const buttons = currentProject.buttons;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= buttons.length) return;
        [buttons[idx], buttons[swapIdx]] = [buttons[swapIdx], buttons[idx]];
        renderButtonEditor();
      });
    });

    // Remove buttons
    buttonEditorEl.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        currentProject.buttons.splice(idx, 1);
        renderButtonEditor();
      });
    });
  }

  addButtonBtn.addEventListener('click', () => {
    if (!currentProject.buttons) currentProject.buttons = [];
    currentProject.buttons.push({ label: 'NEW', color: 'Orange' });
    renderButtonEditor();
  });

  // --- Checklist Template Editor ---
  function syncChecklistEditorToArray() {
    const rows = checklistEditorEl.querySelectorAll('.checklist-editor-row');
    rows.forEach((row, i) => {
      if (checklistTemplate[i]) {
        checklistTemplate[i].label = row.querySelector('[data-field="label"]').value;
        checklistTemplate[i].drops_marker = row.querySelector('[data-field="drops_marker"]').checked;
        checklistTemplate[i].color = row.querySelector('[data-field="color"]').value;
      }
    });
  }

  function renderChecklistEditor() {
    const colors = ['Orange', 'Blue', 'Purple', 'White', 'Pink', 'Red'];

    checklistEditorEl.innerHTML = checklistTemplate.map((item, i) => {
      const colorOptions = colors.map(c =>
        `<option value="${c}" ${c === item.color ? 'selected' : ''}>${c}</option>`
      ).join('');

      return `
        <div class="checklist-editor-row" data-index="${i}">
          <input type="text" value="${escapeHtml(item.label)}" placeholder="Label" data-field="label" />
          <label><input type="checkbox" data-field="drops_marker" ${item.drops_marker ? 'checked' : ''} /> Marker</label>
          <select data-field="color">${colorOptions}</select>
          <button class="btn-remove-row cl-remove" data-index="${i}">&times;</button>
        </div>
      `;
    }).join('');

    checklistEditorEl.querySelectorAll('.cl-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        syncChecklistEditorToArray();
        const idx = parseInt(btn.dataset.index);
        checklistTemplate.splice(idx, 1);
        renderChecklistEditor();
      });
    });
  }

  addChecklistItemBtn.addEventListener('click', () => {
    syncChecklistEditorToArray();
    checklistTemplate.push({ id: null, label: 'NEW', drops_marker: false, color: 'Orange', sort_order: checklistTemplate.length });
    renderChecklistEditor();
  });

  saveSettingsBtn.addEventListener('click', async () => {
    // Read shortcut button values from editor
    const rows = buttonEditorEl.querySelectorAll('.button-editor-row');
    const buttons = [];
    rows.forEach(row => {
      const label = row.querySelector('[data-field="label"]').value.trim();
      const color = row.querySelector('[data-field="color"]').value;
      if (label) {
        buttons.push({ label, color });
      }
    });

    // Read checklist template values from editor
    const clRows = checklistEditorEl.querySelectorAll('.checklist-editor-row');
    const newTemplate = [];
    clRows.forEach((row, i) => {
      const label = row.querySelector('[data-field="label"]').value.trim();
      const drops_marker = row.querySelector('[data-field="drops_marker"]').checked;
      const color = row.querySelector('[data-field="color"]').value;
      if (label) {
        newTemplate.push({
          id: checklistTemplate[i] ? checklistTemplate[i].id : null,
          label, drops_marker, color, sort_order: i
        });
      }
    });

    try {
      // Save shortcut buttons
      await api(`/projects/${currentProject.id}`, {
        method: 'PUT',
        body: { buttons }
      });
      currentProject.buttons = buttons;
      renderShortcutButtons();

      // Save checklist template: delete removed, update existing, create new
      const oldIds = checklistTemplate.map(t => t.id).filter(Boolean);
      const newIds = newTemplate.map(t => t.id).filter(Boolean);

      // Delete removed items
      for (const oldId of oldIds) {
        if (!newIds.includes(oldId)) {
          await api(`/checklist/template/${oldId}`, { method: 'DELETE' });
        }
      }

      // Update existing + create new
      for (const item of newTemplate) {
        if (item.id) {
          await api(`/checklist/template/${item.id}`, {
            method: 'PUT',
            body: { label: item.label, drops_marker: item.drops_marker, color: item.color, sort_order: item.sort_order }
          });
        } else {
          await api('/checklist/template', {
            method: 'POST',
            body: { label: item.label, drops_marker: item.drops_marker, color: item.color }
          });
        }
      }

      // Reload checklist for the current project
      try {
        checklistItems = await api(`/checklist/state?projectId=${currentProject.id}`);
      } catch (err) {
        checklistItems = [];
      }
      renderChecklist();

      settingsModal.classList.add('hidden');
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    }
  });

  // --- Setup DB ---
  setupDbBtn.addEventListener('click', async () => {
    try {
      setupDbBtn.textContent = 'Setting up...';
      setupDbBtn.disabled = true;
      await api('/setup', { method: 'POST' });
      alert('Database tables created successfully!');
      loadProjects();
    } catch (err) {
      alert('Setup failed: ' + err.message);
    } finally {
      setupDbBtn.textContent = 'Setup DB';
      setupDbBtn.disabled = false;
    }
  });

  // --- Back button ---
  backBtn.addEventListener('click', closeProject);

  // --- Create project ---
  createProjectBtn.addEventListener('click', createProject);
  newProjectNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createProject();
  });

  // --- Utility ---
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Init ---
  async function init() {
    await initPusher();
    loadProjects();
  }

  init();
})();
