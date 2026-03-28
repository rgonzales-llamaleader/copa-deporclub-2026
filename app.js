'use strict';

const DEFAULT_SWIM_RECORDS = {
  Damas: {
    '400 LC Metros Libre': { RM: '3:54.18', RN: '4:17.21' },
    '200 LC Metros Comb. Ind.': { RM: '2:05.70', RN: '2:14.70' },
    '200 LC Metros Espalda': { RM: '2:03.14', RN: '2:13.80' },
    '50 LC Metros Libre': { RM: '23.61', RN: '25.80' },
    '100 LC Metros Espalda': { RM: '57.13', RN: '1:01.99' },
    '50 LC Metros Pecho': { RM: '29.16', RN: '32.53' },
    '100 LC Metros Mariposa': { RM: '54.60', RN: '1:00.16' }
  },
  Varones: {
    '400 LC Metros Libre': { RM: '3:39.96', RN: '3:52.18' },
    '200 LC Metros Comb. Ind.': { RM: '1:52.69', RN: '2:04.03' },
    '200 LC Metros Espalda': { RM: '1:51.92', RN: '2:03.10' },
    '50 LC Metros Libre': { RM: '20.91', RN: '23.08' },
    '100 LC Metros Espalda': { RM: '51.60', RN: '56.96' },
    '50 LC Metros Pecho': { RM: '25.95', RN: '28.96' },
    '100 LC Metros Mariposa': { RM: '49.45', RN: '52.91' }
  }
};

let allData = [];
let filtered = [];
let currentPage = 1;
const PAGE_SIZE = 25;

let activeSesion = '';
let activeGenero = '';
let activePrueba = '';
let activeCategoria = '';
let activeEquipo = '';
let activeBuscar = '';
let activePodioSesion = 'all';
let activePodioGenero = 'all';
let activeMedalBuscar = '';
let activeMedalleroType = 'all';
let expandedRelayResults = new Set();
let promoPopupTimer = null;

const PROMO_POPUP_DELAY_MS = 30 * 1000;
const PROMO_POPUP_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const PROMO_POPUP_STORAGE_KEY = 'deporclubPromoPopupLastShownAt';
const SESSION_PILL_LABELS = {
  'Primera Sesion': '25 marzo',
  'Segunda Sesion': '26 marzo',
  'Tercera Fecha': '27 marzo',
  'Tercera Sesion': '27 marzo',
  'Cuarta Sesion': '28 marzo'
};

const isDesktop = () => window.innerWidth >= 768;

function syncBodyScrollLock() {
  const hasOpenOverlay = document.getElementById('filterSheet')?.classList.contains('open')
    || document.getElementById('promoPopup')?.classList.contains('open');
  document.body.style.overflow = hasOpenOverlay ? 'hidden' : '';
}

function timeToSec(str) {
  if (!str || str === 'DQ' || str === 'NS' || str === 'NT' || str === '—') return Infinity;
  const parts = str.split(':');
  return parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(parts[0]);
}

function getRecordBadge(row) {
  if (row.dq || row.ns) return null;
  const refs = getRecordRefs(row);
  if (!refs) return null;
  const time = timeToSec(row.tiempo);
  if (time <= timeToSec(refs.RM.time)) return 'RM';
  if (time <= timeToSec(refs.RN.time)) return 'RN';
  return null;
}

function getRecordRefs(row) {
  return RECORDS.meta?.swimRecords?.[row.genero]?.[row.prueba]
    || DEFAULT_SWIM_RECORDS[row.genero]?.[row.prueba]
    || null;
}

function getPodioMeta(row) {
  if (row.relay) return `Relevo ${row.relayLabel} · ${row.puntos} pts`;
  return `${row.edad} años · ${row.puntos} pts`;
}

function getResultSecondaryMeta(row) {
  if (!row.relay || !Array.isArray(row.integrantes) || !row.integrantes.length) return `${row.genero} Â· ${row.sesionNombre}`;
  return `Relevo ${row.relayLabel} Â· ${row.integrantes.map((item) => item.nombre).join(' / ')}`;
}

function getRelayResultKey(row) {
  return `${row.id}|${row.evento}|${row.equipo}|${row.relayLabel || ''}`;
}

function populateSelect(id, values, allLabel) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>`;
  [...values].sort((a, b) => String(a).localeCompare(String(b), 'es')).forEach((value) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  });
  el.value = current;
}

function normalizeAthleteName(name) {
  return String(name || '')
    .replace(/ϐ|β/g, 'f')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFilterOptions(data) {
  populateSelect('filterSesion', new Set(data.map((r) => r.sesionNombre)), 'Todas');
  populateSelect('filterGenero', new Set(data.map((r) => r.genero)), 'Todos');
  populateSelect('filterPrueba', new Set(data.map((r) => r.prueba)), 'Todas');
  populateSelect('filterCategoria', new Set(data.map((r) => r.categoria)), 'Todas');
  populateSelect('filterEquipo', new Set(data.map((r) => r.equipo)), 'Todos');
}

function renderStats(data) {
  const visibles = data.filter((r) => !r.ns);
  const atletasUnicos = new Set(
    visibles.flatMap((row) => {
      if (row.relay && Array.isArray(row.integrantes)) {
        return row.integrantes.map((item) => item.nombre);
      }
      return row.relay ? [] : [row.nombre];
    })
      .map((name) => normalizeAthleteName(name))
      .filter(Boolean)
  ).size;
  document.getElementById('statAtletas').textContent = atletasUnicos;
  document.getElementById('statEquipos').textContent = new Set(data.map((r) => r.equipo)).size;
  document.getElementById('statCategorias').textContent = new Set(
    data.map((r) => `${r.evento}|${r.genero}|${r.prueba}|${r.categoria}`)
  ).size;
  document.getElementById('statPruebas').textContent = RECORDS.meta.eventos;
  document.getElementById('headerSub').textContent = `${RECORDS.meta.fechas} · ${RECORDS.meta.sesion}`;
}

function renderDatasetCopy(data) {
  const rankingSubtitle = document.getElementById('rankingSubtitle');
  const medalleroSubtitle = document.getElementById('medalleroSubtitle');
  const corte = RECORDS.validacion?.provisional ? 'Corte preliminar' : 'Acumulado oficial';
  const officialUntilEvent = RECORDS.validacion?.officialUntilEvent || RECORDS.meta.eventos;

  if (rankingSubtitle) {
    rankingSubtitle.textContent = `${corte} hasta el Evento ${officialUntilEvent} · ${data.length} resultados procesados`;
  }

  if (medalleroSubtitle) {
    medalleroSubtitle.textContent = `Medallas acumuladas por atleta en todos los eventos disputados hasta el Evento ${RECORDS.meta.eventos}`;
  }
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((node) => node.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

function openSheet() {
  document.getElementById('filterSheet').classList.add('open');
  document.getElementById('sheetBackdrop').classList.add('open');
  syncBodyScrollLock();
}

function closeSheet() {
  document.getElementById('filterSheet').classList.remove('open');
  document.getElementById('sheetBackdrop').classList.remove('open');
  syncBodyScrollLock();
}

function getPromoPopupLastShownAt() {
  try {
    return Number(window.localStorage.getItem(PROMO_POPUP_STORAGE_KEY) || 0);
  } catch {
    return 0;
  }
}

function setPromoPopupLastShownAt(timestamp) {
  try {
    window.localStorage.setItem(PROMO_POPUP_STORAGE_KEY, String(timestamp));
  } catch {
    // Si el navegador bloquea storage, el popup simplemente se comporta como temporal.
  }
}

function shouldShowPromoPopup() {
  return Date.now() - getPromoPopupLastShownAt() >= PROMO_POPUP_COOLDOWN_MS;
}

function openPromoPopup() {
  const popup = document.getElementById('promoPopup');
  const backdrop = document.getElementById('promoPopupBackdrop');

  if (!popup || !backdrop || popup.classList.contains('open')) return;

  popup.classList.add('open');
  backdrop.classList.add('open');
  setPromoPopupLastShownAt(Date.now());
  syncBodyScrollLock();
}

function closePromoPopup() {
  const popup = document.getElementById('promoPopup');
  const backdrop = document.getElementById('promoPopupBackdrop');

  if (!popup || !backdrop) return;

  popup.classList.remove('open');
  backdrop.classList.remove('open');
  syncBodyScrollLock();
}

function schedulePromoPopup() {
  if (!shouldShowPromoPopup()) return;

  window.clearTimeout(promoPopupTimer);
  promoPopupTimer = window.setTimeout(() => {
    if (document.hidden) {
      promoPopupTimer = null;
      return;
    }
    openPromoPopup();
    promoPopupTimer = null;
  }, PROMO_POPUP_DELAY_MS);
}

function syncActiveFiltersFromUI() {
  activeSesion = document.getElementById('filterSesion').value;
  activeGenero = document.getElementById('filterGenero').value;
  activePrueba = document.getElementById('filterPrueba').value;
  activeCategoria = document.getElementById('filterCategoria').value;
  activeEquipo = document.getElementById('filterEquipo').value;
}

function applySheetFilters() {
  syncActiveFiltersFromUI();
  if (!isDesktop()) closeSheet();
  applyFilters();
  updateFilterBtn();
}

function clearSheetFilters() {
  ['filterSesion', 'filterGenero', 'filterPrueba', 'filterCategoria', 'filterEquipo'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  activeSesion = '';
  activeGenero = '';
  activePrueba = '';
  activeCategoria = '';
  activeEquipo = '';
  if (!isDesktop()) closeSheet();
  applyFilters();
  updateFilterBtn();
}

function updateFilterBtn() {
  const count = [activeSesion, activeGenero, activePrueba, activeCategoria, activeEquipo].filter(Boolean).length;
  const btn = document.getElementById('filterToggleBtn');
  btn.innerHTML = count > 0 ? `⚙️ Filtrar <span class="filter-badge">${count}</span>` : '⚙️ Filtrar';
  btn.classList.toggle('has-filters', count > 0);
}

function applyFilters() {
  filtered = allData.filter((r) => {
    if (activeSesion && r.sesionNombre !== activeSesion) return false;
    if (activeGenero && r.genero !== activeGenero) return false;
    if (activePrueba && r.prueba !== activePrueba) return false;
    if (activeCategoria && r.categoria !== activeCategoria) return false;
    if (activeEquipo && r.equipo !== activeEquipo) return false;
    if (activeBuscar) {
      const text = `${r.nombre} ${r.equipo} ${r.prueba}`.toLowerCase();
      if (!text.includes(activeBuscar)) return false;
    }
    return true;
  });
  currentPage = 1;
  renderResults();
  updateResultsInfo();
}

function initCategoryPills(data) {
  const dateContainer = document.getElementById('datePills');
  const genderContainer = document.getElementById('genderPills');
  const sessionPills = [...new Map(
    [...data]
      .sort((a, b) => a.sesion - b.sesion || a.evento - b.evento)
      .map((row) => [row.sesionNombre, row.sesion])
  ).entries()];

  const datePills = [
    { label: 'Todas', value: 'all' },
    ...sessionPills.map(([sessionName]) => ({
      label: SESSION_PILL_LABELS[sessionName] || sessionName,
      value: sessionName
    }))
  ];

  const genderPills = [
    { label: 'Todas', value: 'all' },
    ...[...new Set(data.map((row) => row.genero))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((gender) => ({ label: gender, value: gender }))
  ];

  datePills.forEach((pill, index) => {
    const btn = document.createElement('button');
    btn.className = `pill-btn podio-date-btn${index === 0 ? ' active' : ''}`;
    btn.textContent = pill.label;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.podio-date-btn').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      activePodioSesion = pill.value;
      renderPodios(data, activePodioSesion, activePodioGenero);
    });
    dateContainer.appendChild(btn);
  });

  genderPills.forEach((pill, index) => {
    const btn = document.createElement('button');
    btn.className = `pill-btn podio-gender-btn${index === 0 ? ' active' : ''}`;
    btn.textContent = pill.label;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.podio-gender-btn').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      activePodioGenero = pill.value;
      renderPodios(data, activePodioSesion, activePodioGenero);
    });
    genderContainer.appendChild(btn);
  });
}

function renderPodios(data, sessionFilter = 'all', genderFilter = 'all') {
  const grid = document.getElementById('podiosGrid');
  grid.innerHTML = '';

  const grouped = new Map();
  data.forEach((row) => {
    if (sessionFilter !== 'all' && row.sesionNombre !== sessionFilter) return;
    if (genderFilter !== 'all' && row.genero !== genderFilter) return;
    const key = `${row.evento}|${row.genero}|${row.prueba}|${row.categoria}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  [...grouped.values()]
    .sort((a, b) => a[0].evento - b[0].evento || a[0].categoria.localeCompare(b[0].categoria, 'es'))
    .forEach((rows) => {
      const first = rows[0];
      const recordRefs = getRecordRefs(first);
      const top3 = rows
        .filter((row) => !row.dq && !row.ns && !row.nt && !row.exhibition)
        .sort((a, b) => (a.pos || 999) - (b.pos || 999))
        .slice(0, 3);

      if (!top3.length) return;

      const card = document.createElement('div');
      card.className = 'podio-card';
      card.innerHTML = `
        <div class="podio-header">
          <div class="podio-header-title">Evento ${first.evento} · ${first.genero} · ${first.categoria}</div>
          <div class="podio-header-sub">${first.prueba} · ${first.sesionNombre}</div>
          ${recordRefs ? `
            <div class="podio-records">
              <span class="rec-badge rm">RM</span>
              <span>${recordRefs.RM.time}</span>
              <span class="rec-name">${recordRefs.RM.name}</span>
              <span class="rec-badge rn">RN</span>
              <span>${recordRefs.RN.time}</span>
              <span class="rec-name">${recordRefs.RN.name}</span>
            </div>
          ` : ''}
        </div>
        <div class="podio-places">
          ${top3.map((row, index) => {
            const badge = getRecordBadge(row);
            const breakerClass = badge ? ` record-breaker ${badge.toLowerCase()}-breaker` : '';
            const badgeLabel = badge === 'RM' ? '&#128293; RM' : '&#128293; RN';
            return `
              <div class="podio-place p${index + 1}${breakerClass}">
                <span class="medal-icon">${['🥇', '🥈', '🥉'][index]}</span>
                <div class="place-body">
                  <div class="place-name">${row.nombre}${badge ? ` <span class="record-pill ${badge.toLowerCase()}">${badgeLabel}</span>` : ''}</div>
                  <div class="place-meta"><span class="equipo-tag">${row.equipo}</span> · ${getPodioMeta(row)}</div>
                </div>
                <span class="place-time${badge ? ' record-time' : ''}">${row.displayTime}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
      card.addEventListener('click', () => goToResultados(first));
      grid.appendChild(card);
    });
}

function goToResultados(row) {
  document.querySelectorAll('.tab-btn').forEach((node) => node.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((node) => node.classList.remove('active'));
  document.querySelector('[data-tab="resultados"]').classList.add('active');
  document.getElementById('resultados').classList.add('active');

  document.getElementById('filterSesion').value = row.sesionNombre;
  document.getElementById('filterGenero').value = row.genero;
  document.getElementById('filterPrueba').value = row.prueba;
  document.getElementById('filterCategoria').value = row.categoria;
  document.getElementById('filterEquipo').value = '';
  document.getElementById('filterBuscar').value = '';

  activeBuscar = '';
  syncActiveFiltersFromUI();
  applyFilters();
  updateFilterBtn();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function statusTag(row) {
  if (row.ns) return '<span class="badge-ns">NS</span>';
  if (row.dq) return '<span class="badge-dq">DQ</span>';
  if (row.nt) return '<span class="badge-ns">NT</span>';
  if (row.exhibition) return '<span class="badge-exh">EXH</span>';
  return '';
}

function renderResults() {
  const list = document.getElementById('resultsList');
  list.innerHTML = '';

  const start = (currentPage - 1) * PAGE_SIZE;
  const page = filtered.slice(start, start + PAGE_SIZE);

  if (!page.length) {
    list.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p>Sin resultados para los filtros aplicados</p>
      </div>`;
    renderPagination(0);
    return;
  }

  page.forEach((row) => {
    const card = document.createElement('div');
    let posClass = 'other';
    let posLabel = row.pos ?? '—';

    if (row.ns) {
      posClass = 'dq-pos';
      posLabel = 'NS';
    } else if (row.nt) {
      posClass = 'dq-pos';
      posLabel = 'NT';
    } else if (row.dq) {
      posClass = 'dq-pos';
      posLabel = 'DQ';
    } else if (row.pos === 1) posClass = 'gold';
    else if (row.pos === 2) posClass = 'silver';
    else if (row.pos === 3) posClass = 'bronze';

    const recordBadge = getRecordBadge(row);
    const isRelayExpanded = row.relay && expandedRelayResults.has(getRelayResultKey(row));
    const relayToggle = row.relay
      ? `<button class="equipo-tag equipo-tag-btn" type="button" data-relay-toggle="${getRelayResultKey(row)}">${row.equipo}</button>`
      : `<span class="equipo-tag">${row.equipo}</span>`;
    const relayMembers = row.relay && Array.isArray(row.integrantes) && row.integrantes.length
      ? `
        <div class="rc-relay-members${isRelayExpanded ? ' open' : ''}">
          <div class="rc-relay-title">Integrantes del equipo</div>
          <div class="rc-relay-list">
            ${row.integrantes.map((item) => `
              <div class="rc-relay-member">
                <span class="rc-relay-member-name">${item.nombre}</span>
                <span class="rc-relay-member-meta">${item.genero || row.genero} · ${item.edad} años</span>
              </div>
            `).join('')}
          </div>
        </div>
      `
      : '';
    card.className = `result-card ${row.dq ? 'is-dq' : row.ns ? 'is-ns' : ''}`;
    card.innerHTML = `
      <div class="rc-pos ${posClass}">${posLabel}</div>
      <div class="rc-body">
        <div class="rc-name">${row.nombre}${statusTag(row)}</div>
        <div class="rc-meta">
          ${relayToggle} · Evento ${row.evento} · ${row.prueba} · ${row.categoria}
        </div>
        <div class="rc-submeta">${getResultSecondaryMeta(row)}</div>
        ${relayMembers}
      </div>
      <div class="rc-right">
        <span class="rc-time">${row.displayTime}</span>
        ${recordBadge ? `<span class="rc-record-pill ${recordBadge.toLowerCase()}">${recordBadge}</span>` : ''}
        <span class="rc-points">${row.puntos} pts</span>
      </div>
    `;
    const relayToggleBtn = card.querySelector('[data-relay-toggle]');
    if (relayToggleBtn) {
      relayToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const key = relayToggleBtn.dataset.relayToggle;
        if (expandedRelayResults.has(key)) expandedRelayResults.delete(key);
        else expandedRelayResults.add(key);
        renderResults();
      });
    }
    list.appendChild(card);
  });

  renderPagination(filtered.length);
}

function updateResultsInfo() {
  const hasFilters = [activeSesion, activeGenero, activePrueba, activeCategoria, activeEquipo, activeBuscar].filter(Boolean).length > 0;
  document.getElementById('tableInfo').textContent = `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`;
  document.getElementById('clearAllLink').style.display = hasFilters ? 'inline' : 'none';
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  el.innerHTML = '';
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return;

  el.appendChild(makePageBtn('←', currentPage === 1, () => {
    currentPage -= 1;
    renderResults();
    scrollToTop();
  }));

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(pages, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);

  for (let page = start; page <= end; page += 1) {
    const btn = makePageBtn(page, false, () => {
      currentPage = page;
      renderResults();
      scrollToTop();
    });
    if (page === currentPage) btn.classList.add('active');
    el.appendChild(btn);
  }

  el.appendChild(makePageBtn('→', currentPage === pages, () => {
    currentPage += 1;
    renderResults();
    scrollToTop();
  }));
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

function renderOfficialRanking(targetId, rows) {
  const list = document.getElementById(targetId);
  list.innerHTML = '';
  rows.forEach((team, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = `ranking-row ${index === 0 ? 'rk-gold' : index === 1 ? 'rk-silver' : index === 2 ? 'rk-bronze' : ''}`;
    wrapper.innerHTML = `
      <div class="rk-pos">${index < 3 ? ['🥇', '🥈', '🥉'][index] : team.rank}</div>
      <div class="rk-body">
        <div class="rk-name">${team.teamName}</div>
      </div>
      <div class="rk-points">
        <span class="rk-pts">${team.points}</span>
        <span class="rk-pts-label">pts</span>
      </div>
    `;
    list.appendChild(wrapper);
  });
}

function buildMedallero(rows) {
  const medalists = new Map();
  const ensureEntry = (nombre, equipo, teamName, genero, entityType = 'athlete') => {
    const key = `${entityType}|${nombre}|${equipo}`;
    if (!medalists.has(key)) {
      medalists.set(key, {
        nombre,
        equipo,
        teamName: teamName || equipo,
        genero,
        entityType,
        gold: 0,
        silver: 0,
        bronze: 0,
        total: 0
      });
    }
    return medalists.get(key);
  };

  rows.forEach((row) => {
    if (row.dq || row.ns || row.nt || row.exhibition || ![1, 2, 3].includes(row.pos)) return;

    const addMedal = (athlete) => {
      if (row.pos === 1) athlete.gold += 1;
      if (row.pos === 2) athlete.silver += 1;
      if (row.pos === 3) athlete.bronze += 1;
      athlete.total += 1;
    };

    if (row.relay && Array.isArray(row.integrantes) && row.integrantes.length) {
      const teamEntry = ensureEntry(
        row.teamName || row.nombre,
        row.equipo,
        row.teamName || row.equipo,
        row.genero,
        'team'
      );
      addMedal(teamEntry);

      row.integrantes.forEach((item) => {
        const athlete = ensureEntry(
          item.nombre,
          row.equipo,
          row.teamName || row.equipo,
          item.genero || row.genero,
          'athlete'
        );
        addMedal(athlete);
      });
      return;
    }

    const athlete = ensureEntry(row.nombre, row.equipo, row.teamName || row.equipo, row.genero, 'athlete');
    addMedal(athlete);
  });

  return [...medalists.values()].sort((a, b) => (
    b.gold - a.gold
    || b.silver - a.silver
    || b.bronze - a.bronze
    || b.total - a.total
    || a.nombre.localeCompare(b.nombre, 'es')
  ));
}

function renderMedallero(rows) {
  const list = document.getElementById('medalleroList');
  const info = document.getElementById('medalleroInfo');
  const medallero = buildMedallero(rows).filter((athlete) => (
    (activeMedalleroType === 'all' || athlete.entityType === activeMedalleroType)
    && (
    !activeMedalBuscar
    || athlete.nombre.toLowerCase().includes(activeMedalBuscar)
    || athlete.teamName.toLowerCase().includes(activeMedalBuscar)
    || athlete.equipo.toLowerCase().includes(activeMedalBuscar)
    )
  ));

  info.textContent = `${medallero.length} registro${medallero.length !== 1 ? 's' : ''} con medallas`;
  list.innerHTML = '';

  if (!medallero.length) {
    list.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <p>No hay concursantes que coincidan con la búsqueda</p>
      </div>`;
    return;
  }

  medallero.forEach((athlete) => {
    const card = document.createElement('div');
    card.className = 'ranking-row medallero-row';
    card.innerHTML = `
      <div class="rk-body">
        <div class="rk-name">${athlete.nombre}</div>
        <div class="rk-events"><span class="equipo-tag">${athlete.equipo}</span> · ${athlete.entityType === 'team' ? 'Equipo' : athlete.genero}</div>
      </div>
      <div class="medal-summary">
        <span class="medal-pill gold">🥇 ${athlete.gold}</span>
        <span class="medal-pill silver">🥈 ${athlete.silver}</span>
        <span class="medal-pill bronze">🥉 ${athlete.bronze}</span>
      </div>
    `;
    list.appendChild(card);
  });
}

function initMedalleroSwitch() {
  const buttons = document.querySelectorAll('[data-medallero-target]');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      activeMedalleroType = button.dataset.medalleroTarget;
      buttons.forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      renderMedallero(allData);
    });
  });
}

function initRankingSwitch() {
  const buttons = document.querySelectorAll('.ranking-switch-btn');
  const panels = document.querySelectorAll('.ranking-block');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.rankingTarget;
      buttons.forEach((node) => node.classList.remove('active'));
      panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.rankingPanel === target));
      button.classList.add('active');
    });
  });
}

function init() {
  allData = RECORDS.resultados;
  filtered = [...allData];

  renderStats(allData);
  renderDatasetCopy(allData);
  buildFilterOptions(allData);
  initTabs();
  initCategoryPills(allData);
  renderPodios(allData);
  renderResults();
  updateResultsInfo();
  renderOfficialRanking('rankingListCombined', RECORDS.rankingsOficiales.combined);
  renderOfficialRanking('rankingListWomen', RECORDS.rankingsOficiales.women);
  renderOfficialRanking('rankingListMen', RECORDS.rankingsOficiales.men);
  renderMedallero(allData);
  initRankingSwitch();
  initMedalleroSwitch();
  schedulePromoPopup();

  document.getElementById('filterBuscar').addEventListener('input', (event) => {
    activeBuscar = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  document.getElementById('filterToggleBtn').addEventListener('click', () => {
    if (!isDesktop()) openSheet();
  });

  document.getElementById('medalBuscar').addEventListener('input', (event) => {
    activeMedalBuscar = event.target.value.trim().toLowerCase();
    renderMedallero(allData);
  });

  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  document.getElementById('sheetBackdrop').addEventListener('click', closeSheet);
  document.getElementById('btnApply').addEventListener('click', applySheetFilters);
  document.getElementById('btnClear').addEventListener('click', clearSheetFilters);
  document.getElementById('promoPopupClose').addEventListener('click', closePromoPopup);
  document.getElementById('promoPopupDismiss').addEventListener('click', closePromoPopup);
  document.getElementById('promoPopupBackdrop').addEventListener('click', closePromoPopup);
  document.getElementById('promoPopupLink').addEventListener('click', () => {
    closePromoPopup();
  });

  ['filterSesion', 'filterGenero', 'filterPrueba', 'filterCategoria', 'filterEquipo'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      if (isDesktop()) applySheetFilters();
    });
  });

  document.getElementById('clearAllLink').addEventListener('click', () => {
    document.getElementById('filterBuscar').value = '';
    activeBuscar = '';
    clearSheetFilters();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePromoPopup();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && shouldShowPromoPopup() && promoPopupTimer === null) {
      schedulePromoPopup();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
