'use strict';

// ── State ──
let allData  = [];
let filtered = [];
let currentPage = 1;
const PAGE_SIZE = 25;

// Pending filter values (sheet not yet applied on mobile)
let pendingGenero    = '';
let pendingCategoria = '';
let pendingEquipo    = '';

// Applied filters
let activeGenero    = '';
let activeCategoria = '';
let activeEquipo    = '';
let activeBuscar    = '';

const medals     = ['🥇', '🥈', '🥉'];
const posClass   = ['gold', 'silver', 'bronze'];
const isDesktop  = () => window.innerWidth >= 768;

// ── Populate selects ──
function populateSelect(id, values) {
  const el = document.getElementById(id);
  const cur = el.value;
  el.innerHTML = `<option value="">Todos</option>`;
  [...values].sort().forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    el.appendChild(opt);
  });
  el.value = cur;
}

function buildFilterOptions(data) {
  populateSelect('filterGenero',    new Set(data.map(r => r.genero)));
  populateSelect('filterCategoria', new Set(data.map(r => r.categoria)));
  populateSelect('filterEquipo',    new Set(data.map(r => r.equipo)));
}

// ── Stats ──
function renderStats(data) {
  const valid = data.filter(r => !r.dq);
  document.getElementById('statAtletas').textContent   = valid.length;
  document.getElementById('statEquipos').textContent   = new Set(data.map(r => r.equipo)).size;
  document.getElementById('statCategorias').textContent = new Set(data.map(r => r.categoria)).size;
}

// ── Tabs ──
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

// ── Filter sheet (mobile bottom sheet) ──
function openSheet() {
  // Sync pending state with applied state
  document.getElementById('filterGenero').value    = activeGenero;
  document.getElementById('filterCategoria').value = activeCategoria;
  document.getElementById('filterEquipo').value    = activeEquipo;

  document.getElementById('filterSheet').classList.add('open');
  document.getElementById('sheetBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  document.getElementById('filterSheet').classList.remove('open');
  document.getElementById('sheetBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}

function applySheetFilters() {
  activeGenero    = document.getElementById('filterGenero').value;
  activeCategoria = document.getElementById('filterCategoria').value;
  activeEquipo    = document.getElementById('filterEquipo').value;
  if (!isDesktop()) closeSheet();
  applyFilters();
  updateFilterBtn();
}

function clearSheetFilters() {
  document.getElementById('filterGenero').value    = '';
  document.getElementById('filterCategoria').value = '';
  document.getElementById('filterEquipo').value    = '';
  activeGenero = activeCategoria = activeEquipo = '';
  if (!isDesktop()) closeSheet();
  applyFilters();
  updateFilterBtn();
}

function updateFilterBtn() {
  const count = [activeGenero, activeCategoria, activeEquipo].filter(Boolean).length;
  const btn = document.getElementById('filterToggleBtn');
  if (count > 0) {
    btn.classList.add('has-filters');
    btn.innerHTML = `⚙️ Filtrar <span class="filter-badge">${count}</span>`;
  } else {
    btn.classList.remove('has-filters');
    btn.innerHTML = `⚙️ Filtrar`;
  }
}

// ── Apply all filters ──
function applyFilters() {
  filtered = allData.filter(r => {
    if (activeGenero    && r.genero    !== activeGenero)    return false;
    if (activeCategoria && r.categoria !== activeCategoria) return false;
    if (activeEquipo    && r.equipo    !== activeEquipo)    return false;
    if (activeBuscar) {
      const q = activeBuscar.toLowerCase();
      if (!r.nombre.toLowerCase().includes(q) && !r.equipo.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  currentPage = 1;
  renderResults();
  updateResultsInfo();
}

// ── Podios ──
function initCategoryPills(data) {
  const container = document.getElementById('catPills');
  const generos = ['Todos', ...new Set(data.map(r => r.genero))];

  generos.forEach((g, i) => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn' + (i === 0 ? ' active' : '');
    btn.textContent = g;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPodios(data, g === 'Todos' ? 'all' : g);
    });
    container.appendChild(btn);
  });
}

function renderPodios(data, filterGenero = 'all') {
  const grid = document.getElementById('podiosGrid');
  grid.innerHTML = '';

  // Build category list
  const seen = new Map();
  data.forEach(r => {
    const key = `${r.genero}|${r.categoria}`;
    if (!seen.has(key)) seen.set(key, { genero: r.genero, categoria: r.categoria });
  });

  seen.forEach(cat => {
    if (filterGenero !== 'all' && cat.genero !== filterGenero) return;

    const top3 = data
      .filter(r => r.genero === cat.genero && r.categoria === cat.categoria && !r.dq && !r.exhibition)
      .sort((a, b) => (a.pos || 999) - (b.pos || 999))
      .slice(0, 3);

    if (top3.length === 0) return;

    const icon = cat.genero === 'Damas' ? '♀' : '♂';
    const card = document.createElement('div');
    card.className = 'podio-card';
    card.innerHTML = `
      <div class="podio-header">
        <div class="podio-header-title">${icon} ${cat.genero} &mdash; ${cat.categoria}</div>
        <div class="podio-header-sub">400 LC Metros Libre</div>
      </div>
      <div class="podio-places">
        ${top3.map((r, i) => `
          <div class="podio-place p${i + 1}">
            <span class="medal-icon">${medals[i]}</span>
            <div class="place-body">
              <div class="place-name">${r.nombre}</div>
              <div class="place-meta"><span class="equipo-tag">${r.equipo}</span> &middot; ${r.edad} años</div>
            </div>
            <span class="place-time">${r.tiempo}</span>
          </div>
        `).join('')}
      </div>
    `;
    card.addEventListener('click', () => goToResultados(cat.genero, cat.categoria));
    grid.appendChild(card);
  });
}

// ── Navigate to Resultados with filters ──
function goToResultados(genero, categoria) {
  // Switch to resultados tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="resultados"]').classList.add('active');
  document.getElementById('resultados').classList.add('active');

  // Apply filters
  activeGenero    = genero;
  activeCategoria = categoria;
  activeEquipo    = '';
  activeBuscar    = '';

  // Sync UI
  document.getElementById('filterGenero').value    = genero;
  document.getElementById('filterCategoria').value = categoria;
  document.getElementById('filterEquipo').value    = '';
  document.getElementById('filterBuscar').value    = '';

  applyFilters();
  updateFilterBtn();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Results cards ──
function renderResults() {
  const list = document.getElementById('resultsList');
  list.innerHTML = '';

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    list.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p>Sin resultados para los filtros aplicados</p>
      </div>`;
    renderPagination(0);
    return;
  }

  page.forEach(r => {
    const card = document.createElement('div');

    let posClass = 'other';
    let posLabel = r.pos ?? '—';
    if (r.dq) {
      posClass = 'dq-pos'; posLabel = 'DQ';
    } else if (r.pos === 1) posClass = 'gold';
    else if (r.pos === 2)   posClass = 'silver';
    else if (r.pos === 3)   posClass = 'bronze';

    const cardClass = r.dq ? 'is-dq' : (r.pos <= 3 ? `pos-${r.pos}` : '');
    const exhBadge  = r.exhibition ? '<span class="badge-exh">EXH</span>' : '';
    const timeHtml  = r.dq
      ? '<span class="rc-dq-label">DQ</span>'
      : `<span class="rc-time">${r.tiempo}</span>`;

    card.className = `result-card ${cardClass}`;
    card.innerHTML = `
      <div class="rc-pos ${posClass}">${posLabel}</div>
      <div class="rc-body">
        <div class="rc-name">${r.nombre}${exhBadge}</div>
        <div class="rc-meta"><span class="equipo-tag">${r.equipo}</span> &middot; ${r.genero} &middot; ${r.categoria}</div>
      </div>
      <div class="rc-right">${timeHtml}</div>
    `;
    list.appendChild(card);
  });

  renderPagination(filtered.length);
}

function updateResultsInfo() {
  const hasFilters = activeGenero || activeCategoria || activeEquipo || activeBuscar;
  document.getElementById('tableInfo').textContent =
    `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`;
  document.getElementById('clearAllLink').style.display = hasFilters ? 'inline' : 'none';
}

// ── Pagination ──
function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el = document.getElementById('pagination');
  el.innerHTML = '';
  if (pages <= 1) return;

  const prev = makePageBtn('←', currentPage === 1, () => { currentPage--; renderResults(); scrollToTop(); });
  el.appendChild(prev);

  let start = Math.max(1, currentPage - 2);
  let end   = Math.min(pages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  for (let p = start; p <= end; p++) {
    const btn = makePageBtn(p, false, () => { currentPage = p; renderResults(); scrollToTop(); });
    if (p === currentPage) btn.classList.add('active');
    el.appendChild(btn);
  }

  const next = makePageBtn('→', currentPage === pages, () => { currentPage++; renderResults(); scrollToTop(); });
  el.appendChild(next);
}

function makePageBtn(label, disabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.textContent = label;
  btn.disabled = disabled;
  if (!disabled) btn.addEventListener('click', onClick);
  return btn;
}

function scrollToTop() {
  document.getElementById('resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Init ──
function init() {
  allData  = RECORDS.resultados;
  filtered = [...allData];

  renderStats(allData);
  buildFilterOptions(allData);
  initTabs();
  initCategoryPills(allData);
  renderPodios(allData);
  renderResults();
  updateResultsInfo();

  // Search (live)
  document.getElementById('filterBuscar').addEventListener('input', e => {
    activeBuscar = e.target.value.trim().toLowerCase();
    applyFilters();
  });

  // Filter toggle (mobile: opens sheet / desktop: sheet is inline)
  document.getElementById('filterToggleBtn').addEventListener('click', () => {
    if (isDesktop()) return; // sheet always visible on desktop
    openSheet();
  });

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  document.getElementById('sheetBackdrop').addEventListener('click', closeSheet);
  document.getElementById('btnApply').addEventListener('click', applySheetFilters);
  document.getElementById('btnClear').addEventListener('click', clearSheetFilters);

  // On desktop, apply filters live on select change
  ['filterGenero', 'filterCategoria', 'filterEquipo'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (isDesktop()) applySheetFilters();
    });
  });

  // Clear link
  document.getElementById('clearAllLink').addEventListener('click', () => {
    document.getElementById('filterBuscar').value = '';
    activeBuscar = '';
    clearSheetFilters();
  });
}

document.addEventListener('DOMContentLoaded', init);
