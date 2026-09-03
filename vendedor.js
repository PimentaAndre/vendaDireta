// =============================================
//  vendedor.js – CarneSystem
// =============================================

const SUPABASE_URL = 'https://mqxoosnpmujkopcirtxk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kl2Yj4T6wbPaq34OTfqvRg_G1E2dZEA';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let cutRowCount = 0;
let editingOrderId = null;
let weekEntryCount = 0;
let weekCutRowCount = 0;
let myOrdersFull = [];      // guarda todos os pedidos carregados, para filtrar sem refetch
let ordersTabFilter = 'active'; // 'active' (todo+progress) | 'done'

// ── Verificação de Horário (Brasília) ─────────────────────────────────────────
function getBrasiliaInfo() {
  const now = new Date();
  const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return {
    hour: brasiliaTime.getHours(),
    dayOfWeek: brasiliaTime.getDay(), // 0=dom, 1=seg...5=sex, 6=sab
    dateStr: brasiliaTime.toISOString().split('T')[0]
  };
}

function getTodayBrasilia() {
  const now = new Date();
  const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return brasiliaTime.toISOString().split('T')[0];
}

function isAfterNoonWeekday() {
  const { hour, dayOfWeek } = getBrasiliaInfo();
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  return isWeekday && hour >= 12;
}

function openTimeBlockModal() {
  document.getElementById('modal-time-block').style.display = 'flex';
}
function closeTimeBlockModal() {
  document.getElementById('modal-time-block').style.display = 'none';
}

// ── Catálogo de Carnes ────────────────────────────────────────────────────────
let MEAT_CATALOG = {
  '881': 'ACEM C/PEITO S/OSSO CONG.', '692': 'ACEM PDC CONG.',
  '9': 'ACEM RESFRIADO', '571': 'ACEM BOV S/ OSSO',
  '775': 'BIFE DE PRIMEIRA', '678': 'BIFE DE PRIMEIRA 60G',
  '3238': 'BIFE DE PRIMEIRA CONGELADO', '3188': 'BIFE DE PALETA BOVINA',
  '1124': 'BISTECA BOV. PAULISTA', '3220': 'CARNE MOIDA DE PRIMEIRA CONGELADA',
  '774': 'CARNE MOIDA DE PRIMEIRA CONG.PCTO', '3054': 'CARNE MOIDA (ACEM/PEITO)',
  '75': 'CARNE MOIDA DE PRIMEIRA', '109': 'CARNE MOIDA ESPECIAL',
  '80': 'CARNE MOIDA DE SEGUNDA', '3190': 'CARNE MOIDA CONG.( DT BOV )',
  '3403': 'CARNE MOIDA (ACEM/PEITO) PACOTE', '1109': 'COSTELA BOVINA SERRADA',
  '72': 'CUBO BOVINO ESPECIAL', '3239': 'CUBO BOVINO ESPECIAL CONGELADO',
  '3189': 'CUBO BOVINO', '800': 'CUPIM CONGELADO',
  '673': 'DIANTEIRO BOV SERRADO', '987': 'ISCA BOVINA',
  '179': 'ISCA BOVINA DE PRIMEIRA PCT DE 1KG', '3237': 'ISCA BOVINA CONGELADA',
  '883': 'PALETA BOV.S/ OSSO CONGELADA', '28': 'PALETA BOV.S/ OSSO RESFRIADA',
  '3422': 'PALETA BOV RESF. S/MUSCULO', '2775': 'PALETA BOV S/ OSSO A VACUO',
  '572': 'PALETA BOV S/ OSSO', '557': 'PEITO BOV S/OSSO ',
  '121': 'RETALHO DE SEGUNDA', "142": "FILE MIGNON S/CORDAO LIMPO", "71": "CARRE FATIADO", 
  "500": "COSTELA SUINA FATIADA TIRAS OU CUBOS", "679": "MOCOTO FATIADO",
  "124": "CUPIM BOVINO PROCESSADO", "43686": "CARNE MOIDA DE SEGUNDA PROCESSADA",
  "2042": "COXÃO MOLE VERMELHO", "675": "COXÃO DURO VERMELHO", "676": "LAGARTO VERMELHO", 
  "2618": "MÃO DE VACA SERRADA", '3452': 'ACEM C/PEITO BOV RESF S/OSSO',
  '294': 'COXÃO MOLE (BIFE)'
};

function loadCatalogExtras() {
  try {
    const extras = JSON.parse(localStorage.getItem('cs_meat_catalog_extras') || '{}');
    MEAT_CATALOG = { ...MEAT_CATALOG, ...extras };
  } catch { /* ignora */ }
}

// Lista ordenada para o autocomplete: [{code, name}]
function catalogList() {
  return Object.entries(MEAT_CATALOG)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'vendedor' && currentUser.role !== 'supervisor')
    return window.location.href = 'login.html';

  document.getElementById('header-username').textContent = currentUser.name || currentUser.username;

  if (currentUser.role === 'supervisor') {
    const btn = document.getElementById('btn-dashboard-supervisor');
    if (btn) btn.style.display = 'inline-flex';
  }

  loadCatalogExtras();
  addCutRow();
  loadMyOrders();

  // Pré-preenche "Semana Começando Em" com a próxima segunda-feira
  const weekStartEl = document.getElementById('week-start-date');
  if (weekStartEl) weekStartEl.value = getNextMondayISO();
  addWeekEntry();

  sb.channel('orders-vendedor-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      if (payload.new?.vendor_id === currentUser.id || payload.old?.vendor_id === currentUser.id)
        loadMyOrders();
    }).subscribe();
});

// ── Linhas de Corte ───────────────────────────────────────────────────────────
function addCutRow(prefill = null) {
  cutRowCount++;
  const id = cutRowCount;
  const list = document.getElementById('cuts-list');

  const row = document.createElement('div');
  row.className = 'cut-row';
  row.id = `cut-row-${id}`;
  row.innerHTML = `
    <div class="cut-row-inner">
      <div class="input-group cut-input-code">
        <label>Código</label>
        <input
          type="text"
          id="cut-code-${id}"
          class="cut-code-input"
          placeholder="Ex: 775"
          autocomplete="off"
          oninput="onCodeTyped(${id})"
        />
      </div>
      <div class="input-group cut-input-search" style="position:relative">
        <label>Nome do Corte *</label>
        <input
          type="text"
          id="cut-search-${id}"
          class="cut-search-input"
          placeholder="Nome ou busque pelo código..."
          autocomplete="off"
          oninput="onCutSearch(${id})"
          onfocus="onCutSearch(${id})"
          onblur="hideSuggestions(${id})"
        />
        <div class="cut-suggestions" id="cut-suggestions-${id}" style="display:none"></div>
      </div>
      <div class="input-group cut-input-qty">
        <label>Qtd (kg) *</label>
        <input type="number" id="cut-qty-${id}" placeholder="5.0" min="0.1" step="0.1" oninput="updateTotal()" />
      </div>
      <button class="btn-remove-cut" title="Remover corte" onclick="removeCutRow(${id})">✕</button>
    </div>`;

  list.appendChild(row);

  if (prefill) {
    document.getElementById(`cut-code-${id}`).value = prefill.code || '';
    document.getElementById(`cut-search-${id}`).value = prefill.name || prefill.type || '';
    document.getElementById(`cut-search-${id}`).dataset.code = prefill.code || '';
    document.getElementById(`cut-search-${id}`).dataset.name = prefill.name || prefill.type || '';
    document.getElementById(`cut-qty-${id}`).value = prefill.qty || '';
  }

  updateTotal();
  if (!prefill) setTimeout(() => document.getElementById(`cut-code-${id}`).focus(), 50);
}

function removeCutRow(id) {
  const rows = document.querySelectorAll('.cut-row');
  if (rows.length <= 1) return;
  document.getElementById(`cut-row-${id}`).remove();
  updateTotal();
}

// Quando o usuário digita no campo de código, preenche o nome automaticamente
function onCodeTyped(id) {
  const code = document.getElementById(`cut-code-${id}`).value.trim();
  const nameEl = document.getElementById(`cut-search-${id}`);
  if (!code) return;
  const found = MEAT_CATALOG[code];
  if (found) {
    nameEl.value = found;
    nameEl.dataset.code = code;
    nameEl.dataset.name = found;
    updateTotal();
  }
}
function onCutSearch(id) {
  const input = document.getElementById(`cut-search-${id}`);
  const query = input.value.trim().toLowerCase();
  const box = document.getElementById(`cut-suggestions-${id}`);

  if (!query) {
    // mostra todos quando campo está vazio mas focado
    renderSuggestions(id, catalogList().slice(0, 40));
    return;
  }

  const filtered = catalogList().filter(item =>
    item.code.toLowerCase().includes(query) ||
    item.name.toLowerCase().includes(query)
  ).slice(0, 20);

  // Inclui opção "usar como está" se não for código exato
  renderSuggestions(id, filtered, query);
}

function renderSuggestions(id, items, rawQuery = '') {
  const box = document.getElementById(`cut-suggestions-${id}`);

  if (items.length === 0 && !rawQuery) { box.style.display = 'none'; return; }

  let html = '';

  items.forEach(item => {
    html += `
      <div class="cut-suggestion-item" onmousedown="selectSuggestion(${id}, '${escJs(item.code)}', '${escJs(item.name)}')">
        <span class="sug-code">${escHtml(item.code)}</span>
        <span class="sug-name">${escHtml(item.name)}</span>
      </div>`;
  });

  // Opção: digitar livremente sem código
  if (rawQuery && !MEAT_CATALOG[rawQuery]) {
    html += `
      <div class="cut-suggestion-item cut-suggestion-free" onmousedown="selectFree(${id}, '${escJs(rawQuery)}')">
        <span class="sug-free">✏️ Usar "<strong>${escHtml(rawQuery)}</strong>" sem código</span>
      </div>`;
  }

  box.innerHTML = html;
  box.style.display = html ? 'block' : 'none';
}

function selectSuggestion(id, code, name) {
  const searchEl = document.getElementById(`cut-search-${id}`);
  const codeEl = document.getElementById(`cut-code-${id}`);
  searchEl.value = name;
  searchEl.dataset.code = code;
  searchEl.dataset.name = name;
  if (codeEl) codeEl.value = code;
  hideSuggestions(id);
  document.getElementById(`cut-qty-${id}`).focus();
  updateTotal();
}

function selectFree(id, rawText) {
  const searchEl = document.getElementById(`cut-search-${id}`);
  searchEl.value = rawText;
  searchEl.dataset.code = '';
  searchEl.dataset.name = rawText;
  hideSuggestions(id);
  document.getElementById(`cut-qty-${id}`).focus();
  updateTotal();
}

function hideSuggestions(id) {
  setTimeout(() => {
    const box = document.getElementById(`cut-suggestions-${id}`);
    if (box) box.style.display = 'none';
  }, 150);
}

// ── Total ─────────────────────────────────────────────────────────────────────
function updateTotal() {
  let total = 0;
  document.querySelectorAll('.cut-row').forEach(row => {
    const id = row.id.replace('cut-row-', '');
    const qty = parseFloat(document.getElementById(`cut-qty-${id}`)?.value) || 0;
    total += qty;
  });
  const totalEl = document.getElementById('cuts-total');
  const kgEl = document.getElementById('cuts-total-kg');
  if (total > 0) { totalEl.style.display = 'flex'; kgEl.textContent = total.toFixed(2).replace('.', ',') + ' kg'; }
  else totalEl.style.display = 'none';
}

function getCutRows() {
  const rows = document.querySelectorAll('.cut-row');
  const cuts = [];
  let valid = true;

  rows.forEach(row => {
    const id = row.id.replace('cut-row-', '');
    const input = document.getElementById(`cut-search-${id}`);
    const qty = parseFloat(document.getElementById(`cut-qty-${id}`)?.value);
    const name = input?.dataset.name || input?.value.trim();
    const code = input?.dataset.code || '';

    if (!name || !qty || qty <= 0) { valid = false; return; }
    cuts.push({ code, type: name, qty });
  });

  return valid ? cuts : null;
}

// ── Criar Pedido ──────────────────────────────────────────────────────────────
async function createOrder() {
  hideMsg('order-error');
  hideMsg('order-success');

  const client = document.getElementById('order-client').value.trim();
  const clientCode = document.getElementById('order-client-code').value.trim();
  const obs = document.getElementById('order-obs').value.trim();
  const deliveryDate = document.getElementById('order-delivery-date').value;
  const cuts = getCutRows();

  if (!client) return showMsg('order-error', 'Informe o nome do cliente.');
  if (!clientCode) return showMsg('order-error', 'Informe a sigla do cliente.');
  if (!deliveryDate) return showMsg('order-error', 'Informe o dia de entrega.');
  if (!cuts) return showMsg('order-error', 'Preencha todos os cortes com nome e quantidade.');
  if (!cuts.length) return showMsg('order-error', 'Adicione pelo menos um corte.');

  // ── Bloqueio de horário: após 12h em dias úteis, não permite pedido para hoje ──
  if (isAfterNoonWeekday() && deliveryDate === getTodayBrasilia()) {
    return openTimeBlockModal();
  }

  setLoading('btn-order', true);
  try {
    const totalKg = cuts.reduce((s, c) => s + c.qty, 0);
    const cutType = cuts.map(c => `${c.code ? '[' + c.code + '] ' : ''}${c.type} (${c.qty.toString().replace('.', ',')} kg)`).join(' | ');

    const { error } = await sb.from('orders').insert([{
      vendor_id: currentUser.id,
      vendor_name: currentUser.name || currentUser.username,
      client_name: client,
      client_code: clientCode,
      cut_type: cutType,
      cuts_json: JSON.stringify(cuts),
      quantity_kg: parseFloat(totalKg.toFixed(2)),
      observations: obs || null,
      delivery_date: deliveryDate,
      status: 'todo',
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    document.getElementById('order-client').value = '';
    document.getElementById('order-client-code').value = '';
    document.getElementById('order-delivery-date').value = '';
    document.getElementById('order-obs').value = '';
    document.getElementById('cuts-list').innerHTML = '';
    cutRowCount = 0;
    addCutRow();

    showMsg('order-success', '✅ Pedido enviado para a produção!', 'success');
    loadMyOrders();
  } catch (e) {
    console.error(e);
    showMsg('order-error', 'Erro ao criar pedido: ' + (e.message || 'tente novamente.'));
  } finally {
    setLoading('btn-order', false);
  }
}

// ── Pedido Semanal (múltiplos clientes/dias) ────────────────────────────────
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Segunda-feira' },
  { value: 1, label: 'Terça-feira' },
  { value: 2, label: 'Quarta-feira' },
  { value: 3, label: 'Quinta-feira' },
  { value: 4, label: 'Sexta-feira' },
  { value: 5, label: 'Sábado' },
];

function getNextMondayISO() {
  const { dateStr } = getBrasiliaInfo();
  const today = new Date(dateStr + 'T00:00:00');
  const dow = today.getDay(); // 0=dom...6=sab
  const diffToMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
  today.setDate(today.getDate() + diffToMonday);
  return today.toISOString().split('T')[0];
}

function switchOrderMode(mode) {
  const isSingle = mode === 'single';
  document.getElementById('single-order-form').style.display = isSingle ? 'block' : 'none';
  document.getElementById('weekly-order-form').style.display = isSingle ? 'none' : 'block';
  document.getElementById('tab-order-single').classList.toggle('active', isSingle);
  document.getElementById('tab-order-weekly').classList.toggle('active', !isSingle);
}

function openWeekHelpModal() {
  document.getElementById('modal-week-help').style.display = 'flex';
}
function closeWeekHelpModal() {
  document.getElementById('modal-week-help').style.display = 'none';
}

// Cada "entrega" = 1 pedido (dia + cliente), e pode ter vários cortes dentro.
function addWeekEntry() {
  weekEntryCount++;
  const entryId = 'we' + weekEntryCount;
  const list = document.getElementById('week-entries-list');

  const entry = document.createElement('div');
  entry.className = 'week-entry';
  entry.id = `week-entry-${entryId}`;
  entry.innerHTML = `
    <div class="week-entry-topbar">
      <span class="week-entry-label">🗓️ Entrega</span>
      <button type="button" class="week-entry-remove-btn" title="Remover esta entrega inteira" onclick="removeWeekEntry('${entryId}')">🗑️ Remover Entrega</button>
    </div>

    <div class="week-entry-header">
      <div class="input-group week-input-day">
        <label>Dia</label>
        <select id="week-day-${entryId}" onchange="updateWeekTotal()">
          ${WEEKDAY_OPTIONS.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
        </select>
      </div>
      <div class="input-group week-input-client">
        <label>Cliente *</label>
        <input type="text" id="week-client-${entryId}" placeholder="Ex: Empório Dom Luis" autocomplete="off" />
      </div>
      <div class="input-group week-input-code">
        <label>Marca *</label>
        <input type="text" id="week-code-${entryId}" placeholder="Ex: EDL01" autocomplete="off" />
      </div>
    </div>

    <div class="week-entry-cuts" id="week-entry-cuts-${entryId}"></div>

    <div class="week-entry-footer">
      <button class="btn btn-ghost btn-sm" type="button" onclick="addWeekCutRow('${entryId}')">+ Adicionar Corte</button>
      <span class="week-entry-subtotal" id="week-entry-subtotal-${entryId}">0 kg</span>
    </div>`;

  list.appendChild(entry);
  addWeekCutRow(entryId); // toda entrega nasce com pelo menos 1 corte
}

function removeWeekEntry(entryId) {
  const entries = document.querySelectorAll('.week-entry');
  if (entries.length <= 1) return;
  document.getElementById(`week-entry-${entryId}`).remove();
  updateWeekTotal();
}

function addWeekCutRow(entryId) {
  weekCutRowCount++;
  const cutId = 'wc' + weekCutRowCount;
  const container = document.getElementById(`week-entry-cuts-${entryId}`);

  const row = document.createElement('div');
  row.className = 'cut-row';
  row.id = `cut-row-${cutId}`;
  row.innerHTML = `
    <div class="cut-row-inner">
      <div class="input-group cut-input-code">
        <label>Código</label>
        <input
          type="text"
          id="cut-code-${cutId}"
          class="cut-code-input"
          placeholder="Ex: 775"
          autocomplete="off"
          oninput="onCodeTypedEdit('${cutId}')"
        />
      </div>
      <div class="input-group cut-input-search" style="position:relative">
        <label>Nome do Corte *</label>
        <input
          type="text"
          id="cut-search-${cutId}"
          class="cut-search-input"
          placeholder="Nome ou busque pelo código..."
          autocomplete="off"
          oninput="onCutSearchEdit('${cutId}')"
          onfocus="onCutSearchEdit('${cutId}')"
          onblur="hideSuggestions('${cutId}')"
        />
        <div class="cut-suggestions" id="cut-suggestions-${cutId}" style="display:none"></div>
      </div>
      <div class="input-group cut-input-qty">
        <label>Qtd (kg) *</label>
        <input type="number" id="cut-qty-${cutId}" placeholder="5.0" min="0.1" step="0.1" oninput="updateWeekTotal()" />
      </div>
      <button class="btn-remove-cut" title="Remover corte" onclick="removeWeekCutRow('${entryId}','${cutId}')">✕</button>
    </div>`;

  container.appendChild(row);
  updateWeekTotal();
}

function removeWeekCutRow(entryId, cutId) {
  const rows = document.getElementById(`week-entry-cuts-${entryId}`).querySelectorAll('.cut-row');
  if (rows.length <= 1) return;
  document.getElementById(`cut-row-${cutId}`).remove();
  updateWeekTotal();
}

function updateWeekTotal() {
  const entries = document.querySelectorAll('.week-entry');
  let grandTotal = 0;

  entries.forEach(entryEl => {
    const entryId = entryEl.id.replace('week-entry-', '');
    let subtotal = 0;
    entryEl.querySelectorAll('.week-entry-cuts .cut-row').forEach(row => {
      const cutId = row.id.replace('cut-row-', '');
      const qty = parseFloat(document.getElementById(`cut-qty-${cutId}`)?.value) || 0;
      subtotal += qty;
    });
    const subtotalEl = document.getElementById(`week-entry-subtotal-${entryId}`);
    if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2).replace('.', ',') + ' kg';
    grandTotal += subtotal;
  });

  const totalEl = document.getElementById('week-total');
  const kgEl = document.getElementById('week-total-kg');
  const countEl = document.getElementById('week-total-count');
  if (grandTotal > 0) {
    totalEl.style.display = 'flex';
    kgEl.textContent = grandTotal.toFixed(2).replace('.', ',') + ' kg';
    countEl.textContent = `${entries.length} pedido${entries.length > 1 ? 's' : ''}`;
  } else {
    totalEl.style.display = 'none';
  }
}

function getWeekEntries() {
  const entryEls = document.querySelectorAll('.week-entry');
  const entries = [];
  let valid = true;

  entryEls.forEach(entryEl => {
    const entryId = entryEl.id.replace('week-entry-', '');
    const dayOffset = parseInt(document.getElementById(`week-day-${entryId}`)?.value, 10);
    const client = document.getElementById(`week-client-${entryId}`)?.value.trim();
    const clientCode = document.getElementById(`week-code-${entryId}`)?.value.trim();

    const cuts = [];
    entryEl.querySelectorAll('.week-entry-cuts .cut-row').forEach(row => {
      const cutId = row.id.replace('cut-row-', '');
      const cutInput = document.getElementById(`cut-search-${cutId}`);
      const qty = parseFloat(document.getElementById(`cut-qty-${cutId}`)?.value);
      const cutName = cutInput?.dataset.name || cutInput?.value.trim();
      const cutCode = cutInput?.dataset.code || '';
      if (!cutName || !qty || qty <= 0) { valid = false; return; }
      cuts.push({ code: cutCode, type: cutName, qty });
    });

    if (!client || !clientCode || !cuts.length) { valid = false; return; }
    entries.push({ dayOffset, client, clientCode, cuts });
  });

  return valid && entries.length ? entries : null;
}

async function submitWeeklyOrders() {
  hideMsg('week-error');
  hideMsg('week-success');

  const weekStart = document.getElementById('week-start-date').value;
  if (!weekStart) return showMsg('week-error', 'Informe a data de início da semana.');

  const entries = getWeekEntries();
  if (!entries) return showMsg('week-error', 'Preencha cliente, marca e ao menos um corte válido em cada entrega.');

  // Calcula a data de entrega de cada entrega (semana início + dia da semana)
  const entriesWithDate = entries.map(e => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + e.dayOffset);
    return { ...e, deliveryDate: d.toISOString().split('T')[0] };
  });

  // Bloqueio de horário: se alguma entrega cair em hoje e já passou das 12h em dia útil
  const blocked = entriesWithDate.some(e => isAfterNoonWeekday() && e.deliveryDate === getTodayBrasilia());
  if (blocked) return openTimeBlockModal();

  setLoading('btn-week-order', true);
  try {
    const payload = entriesWithDate.map(e => {
      const totalKg = e.cuts.reduce((s, c) => s + c.qty, 0);
      const cutType = e.cuts.map(c => `${c.code ? '[' + c.code + '] ' : ''}${c.type} (${c.qty.toString().replace('.', ',')} kg)`).join(' | ');
      return {
        vendor_id: currentUser.id,
        vendor_name: currentUser.name || currentUser.username,
        client_name: e.client,
        client_code: e.clientCode,
        cut_type: cutType,
        cuts_json: JSON.stringify(e.cuts),
        quantity_kg: parseFloat(totalKg.toFixed(2)),
        observations: null,
        delivery_date: e.deliveryDate,
        status: 'todo',
        created_at: new Date().toISOString()
      };
    });

    const { error } = await sb.from('orders').insert(payload);
    if (error) throw error;

    document.getElementById('week-entries-list').innerHTML = '';
    weekEntryCount = 0;
    addWeekEntry();
    document.getElementById('week-start-date').value = getNextMondayISO();

    showMsg('week-success', `✅ ${payload.length} pedido${payload.length > 1 ? 's' : ''} enviado${payload.length > 1 ? 's' : ''} para a produção!`, 'success');
    loadMyOrders();
  } catch (e) {
    console.error(e);
    showMsg('week-error', 'Erro ao criar pedidos: ' + (e.message || 'tente novamente.'));
  } finally {
    setLoading('btn-week-order', false);
  }
}

// ── Meus Pedidos ──────────────────────────────────────────────────────────────
async function loadMyOrders() {
  document.getElementById('my-orders-loading').style.display = 'block';
  document.getElementById('my-orders-empty').style.display = 'none';
  document.getElementById('my-orders-list').style.display = 'none';

  try {
    const { data: orders, error } = await sb
      .from('orders').select('*')
      .eq('vendor_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    document.getElementById('my-orders-loading').style.display = 'none';

    myOrdersFull = orders || [];

    document.getElementById('count-orders-active').textContent =
      myOrdersFull.filter(o => o.status === 'todo' || o.status === 'progress').length;
    document.getElementById('count-orders-done').textContent =
      myOrdersFull.filter(o => o.status === 'done').length;

    renderMyOrders();

  } catch (e) {
    console.error(e);
    document.getElementById('my-orders-loading').textContent = 'Erro ao carregar pedidos.';
  }
}

function switchOrdersTab(tab) {
  ordersTabFilter = tab;
  document.getElementById('tab-orders-active').classList.toggle('active', tab === 'active');
  document.getElementById('tab-orders-done').classList.toggle('active', tab === 'done');
  renderMyOrders();
}

function renderMyOrders() {
  const orders = myOrdersFull.filter(o =>
    ordersTabFilter === 'done' ? o.status === 'done' : (o.status === 'todo' || o.status === 'progress')
  );

  document.getElementById('my-orders-empty').style.display = orders.length ? 'none' : 'block';
  document.getElementById('my-orders-list').style.display = orders.length ? 'block' : 'none';

  if (!orders.length) return;

  const tbody = document.getElementById('my-orders-tbody');
  tbody.innerHTML = '';

  const statusMap = {
    todo: { label: 'Pendente', cls: 'status-todo' },
    progress: { label: 'Em Produção', cls: 'status-progress' },
    done: { label: 'Concluído', cls: 'status-done' }
  };

  orders.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleString('pt-BR');
      const st = statusMap[o.status] || statusMap.todo;

      let cutsHtml = '';
      try {
        const cuts = JSON.parse(o.cuts_json || '[]');
        cutsHtml = cuts.map(c =>
          `<div class="cut-tag">${c.code ? `<span class="cut-code-badge">${escHtml(c.code)}</span> ` : ''}🥩 ${escHtml(c.type)} <span>${c.qty.toString().replace('.', ',')} kg</span></div>`
        ).join('');
      } catch { cutsHtml = `<div class="cut-tag">🥩 ${escHtml(o.cut_type)}</div>`; }

      // Botão editar: vendedor só edita 'todo', supervisor edita qualquer status
      const canEdit = currentUser.role === 'supervisor' || o.status === 'todo';
      const editBtn = canEdit
        ? `<button class="btn btn-ghost btn-sm" onclick="openEditModal('${o.id}')">✏️ Editar</button>`
        : '';

      tbody.innerHTML += `
        <tr>
          <td style="color:var(--text-muted);font-size:0.75rem">#${i + 1}</td>
          <td><strong>${escHtml(o.client_name)}</strong></td>
          <td><span class="cut-code-badge">${o.client_code ? escHtml(o.client_code) : '–'}</span></td>
          <td class="cuts-cell">${cutsHtml}</td>
          <td style="color:var(--gold);font-weight:600">${String(o.quantity_kg).replace('.', ',')} kg</td>
          <td style="color:var(--text-muted)">${o.observations ? escHtml(o.observations) : '–'}</td>
          <td style="color:var(--gold);font-weight:600">${o.delivery_date ? formatDeliveryDate(o.delivery_date) : '–'}</td>
          <td><span class="status-badge ${st.cls}">${st.label}</span></td>
          <td style="color:var(--text-muted);font-size:0.8rem">${date}</td>
          <td>${editBtn}</td>
        </tr>`;
  });
}

// ── Modal de Edição ───────────────────────────────────────────────────────────
async function openEditModal(orderId) {
  const { data: o, error } = await sb.from('orders').select('*').eq('id', orderId).single();
  if (error || !o) return;

  // Checagem real de permissão: vendedor só edita pedidos 'Pendente'.
  // Não confiamos apenas no botão escondido na tabela, pois o status pode
  // ter mudado (produção iniciou o pedido) entre o carregamento da lista e o clique.
  if (currentUser.role !== 'supervisor' && o.status !== 'todo') {
    showMsg('order-error', 'Este pedido já está em produção e não pode mais ser editado.');
    loadMyOrders();
    return;
  }

  editingOrderId = orderId;

  document.getElementById('edit-client').value = o.client_name;
  document.getElementById('edit-client-code').value = o.client_code || '';
  document.getElementById('edit-delivery').value = o.delivery_date || '';
  document.getElementById('edit-obs').value = o.observations || '';
  document.getElementById('edit-error').style.display = 'none';

  // Preenche cortes
  const editCutsList = document.getElementById('edit-cuts-list');
  editCutsList.innerHTML = '';
  let editCutCount = 0;

  let cuts = [];
  try { cuts = JSON.parse(o.cuts_json || '[]'); } catch { cuts = []; }
  if (!cuts.length && o.cut_type) cuts = [{ code: '', type: o.cut_type, qty: o.quantity_kg }];

  cuts.forEach(c => {
    editCutCount++;
    const id = 'e' + editCutCount;
    const row = document.createElement('div');
    row.className = 'cut-row';
    row.id = `cut-row-${id}`;
    row.innerHTML = `
      <div class="cut-row-inner">
        <div class="input-group cut-input-code">
          <label>Código</label>
          <input
            type="text"
            id="cut-code-${id}"
            class="cut-code-input"
            placeholder="Ex: 775"
            autocomplete="off"
            value="${escHtml(c.code || '')}"
            oninput="onCodeTypedEdit('${id}')"
          />
        </div>
        <div class="input-group cut-input-search" style="position:relative">
          <label>Nome do Corte *</label>
          <input
            type="text"
            id="cut-search-${id}"
            class="cut-search-input"
            placeholder="Nome ou busque pelo código..."
            autocomplete="off"
            value="${escHtml(c.type)}"
            data-code="${escHtml(c.code || '')}"
            data-name="${escHtml(c.type)}"
            oninput="onCutSearchEdit('${id}')"
            onfocus="onCutSearchEdit('${id}')"
            onblur="hideSuggestions('${id}')"
          />
          <div class="cut-suggestions" id="cut-suggestions-${id}" style="display:none"></div>
        </div>
        <div class="input-group cut-input-qty">
          <label>Qtd (kg) *</label>
          <input type="number" id="cut-qty-${id}" value="${c.qty}" placeholder="5.0" min="0.1" step="0.1" oninput="updateEditTotal()" />
        </div>
        <button class="btn-remove-cut" title="Remover" onclick="removeEditCutRow('${id}')">✕</button>
      </div>`;
    editCutsList.appendChild(row);
  });

  updateEditTotal();
  document.getElementById('modal-edit-order').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('modal-edit-order').style.display = 'none';
  editingOrderId = null;
}

// Autocomplete dentro do modal de edição (usa mesma lógica, prefixo 'e')
function onCutSearchEdit(id) {
  const input = document.getElementById(`cut-search-${id}`);
  const query = input.value.trim().toLowerCase();
  const box = document.getElementById(`cut-suggestions-${id}`);

  const filtered = !query
    ? catalogList().slice(0, 40)
    : catalogList().filter(item =>
      item.code.toLowerCase().includes(query) ||
      item.name.toLowerCase().includes(query)
    ).slice(0, 20);

  let html = '';
  filtered.forEach(item => {
    html += `
      <div class="cut-suggestion-item" onmousedown="selectSuggestionEdit('${id}', '${escJs(item.code)}', '${escJs(item.name)}')">
        <span class="sug-code">${escHtml(item.code)}</span>
        <span class="sug-name">${escHtml(item.name)}</span>
      </div>`;
  });
  if (query && !MEAT_CATALOG[query]) {
    html += `
      <div class="cut-suggestion-item cut-suggestion-free" onmousedown="selectFree('${id}', '${escJs(query)}')">
        <span class="sug-free">✏️ Usar "<strong>${escHtml(query)}</strong>" sem código</span>
      </div>`;
  }
  box.innerHTML = html;
  box.style.display = html ? 'block' : 'none';
}

function selectSuggestionEdit(id, code, name) {
  const searchEl = document.getElementById(`cut-search-${id}`);
  const codeEl = document.getElementById(`cut-code-${id}`);
  searchEl.value = name;
  searchEl.dataset.code = code;
  searchEl.dataset.name = name;
  if (codeEl) codeEl.value = code;
  hideSuggestions(id);
  document.getElementById(`cut-qty-${id}`).focus();
  updateEditTotal();
}

function onCodeTypedEdit(id) {
  const code = document.getElementById(`cut-code-${id}`).value.trim();
  const nameEl = document.getElementById(`cut-search-${id}`);
  if (!code) return;
  const found = MEAT_CATALOG[code];
  if (found) {
    nameEl.value = found;
    nameEl.dataset.code = code;
    nameEl.dataset.name = found;
    updateEditTotal();
  }
}

function removeEditCutRow(id) {
  const rows = document.getElementById('edit-cuts-list').querySelectorAll('.cut-row');
  if (rows.length <= 1) return;
  document.getElementById(`cut-row-${id}`).remove();
  updateEditTotal();
}

function addEditCutRow() {
  const id = 'e' + Date.now();
  const list = document.getElementById('edit-cuts-list');
  const row = document.createElement('div');
  row.className = 'cut-row';
  row.id = `cut-row-${id}`;
  row.innerHTML = `
    <div class="cut-row-inner">
      <div class="input-group cut-input-code">
        <label>Código</label>
        <input
          type="text"
          id="cut-code-${id}"
          class="cut-code-input"
          placeholder="Ex: 775"
          autocomplete="off"
          oninput="onCodeTypedEdit('${id}')"
        />
      </div>
      <div class="input-group cut-input-search" style="position:relative">
        <label>Nome do Corte *</label>
        <input
          type="text"
          id="cut-search-${id}"
          class="cut-search-input"
          placeholder="Nome ou busque pelo código..."
          autocomplete="off"
          oninput="onCutSearchEdit('${id}')"
          onfocus="onCutSearchEdit('${id}')"
          onblur="hideSuggestions('${id}')"
        />
        <div class="cut-suggestions" id="cut-suggestions-${id}" style="display:none"></div>
      </div>
      <div class="input-group cut-input-qty">
        <label>Qtd (kg) *</label>
        <input type="number" id="cut-qty-${id}" placeholder="5.0" min="0.1" step="0.1" oninput="updateEditTotal()" />
      </div>
      <button class="btn-remove-cut" onclick="removeEditCutRow('${id}')">✕</button>
    </div>`;
  list.appendChild(row);
  setTimeout(() => document.getElementById(`cut-code-${id}`).focus(), 50);
}

function updateEditTotal() {
  let total = 0;
  document.getElementById('edit-cuts-list')?.querySelectorAll('.cut-row').forEach(row => {
    const id = row.id.replace('cut-row-', '');
    const qty = parseFloat(document.getElementById(`cut-qty-${id}`)?.value) || 0;
    total += qty;
  });
  const el = document.getElementById('edit-total-kg');
  if (el) el.textContent = total > 0 ? total.toFixed(2).replace('.', ',') + ' kg' : '—';
}

function getEditCutRows() {
  const rows = document.getElementById('edit-cuts-list').querySelectorAll('.cut-row');
  const cuts = [];
  let valid = true;
  rows.forEach(row => {
    const id = row.id.replace('cut-row-', '');
    const input = document.getElementById(`cut-search-${id}`);
    const qty = parseFloat(document.getElementById(`cut-qty-${id}`)?.value);
    const name = input?.dataset.name || input?.value.trim();
    const code = input?.dataset.code || '';
    if (!name || !qty || qty <= 0) { valid = false; return; }
    cuts.push({ code, type: name, qty });
  });
  return valid ? cuts : null;
}

async function saveEditOrder() {
  const client = document.getElementById('edit-client').value.trim();
  const clientCode = document.getElementById('edit-client-code').value.trim();
  const deliveryDate = document.getElementById('edit-delivery').value;
  const obs = document.getElementById('edit-obs').value.trim();
  const cuts = getEditCutRows();
  const errEl = document.getElementById('edit-error');

  errEl.style.display = 'none';
  if (!client) { errEl.textContent = 'Informe o nome do cliente.'; errEl.style.display = 'block'; return; }
  if (!clientCode) { errEl.textContent = 'Informe a sigla do cliente.'; errEl.style.display = 'block'; return; }
  if (!deliveryDate) { errEl.textContent = 'Informe a data de entrega.'; errEl.style.display = 'block'; return; }
  if (!cuts) { errEl.textContent = 'Preencha todos os cortes.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('btn-save-edit');
  btn.disabled = true;
  btn.textContent = '⏳ Salvando...';

  try {
    const totalKg = cuts.reduce((s, c) => s + c.qty, 0);
    const cutType = cuts.map(c => `${c.code ? '[' + c.code + '] ' : ''}${c.type} (${c.qty.toString().replace('.', ',')} kg)`).join(' | ');

    // Vendedor só pode salvar se o pedido AINDA estiver 'todo' no banco no momento exato
    // do save. Isso evita a corrida: produção pode ter iniciado o pedido entre o modal
    // abrir e o vendedor clicar em salvar. Supervisor não tem essa restrição.
    let query = sb.from('orders').update({
      client_name: client,
      client_code: clientCode,
      cut_type: cutType,
      cuts_json: JSON.stringify(cuts),
      quantity_kg: parseFloat(totalKg.toFixed(2)),
      observations: obs || null,
      delivery_date: deliveryDate,
    }).eq('id', editingOrderId);

    if (currentUser.role !== 'supervisor') {
      query = query.eq('status', 'todo');
    }

    const { data, error } = await query.select('id');

    if (error) throw error;

    // Nenhuma linha afetada = o filtro de status bloqueou a atualização,
    // ou seja, o pedido não está mais 'todo' (já entrou em produção).
    if (!data || data.length === 0) {
      errEl.textContent = 'Este pedido já entrou em produção e não pode mais ser editado.';
      errEl.style.display = 'block';
      closeEditModal();
      loadMyOrders();
      return;
    }

    closeEditModal();
    loadMyOrders();
  } catch (e) {
    console.error(e);
    errEl.textContent = 'Erro ao salvar: ' + (e.message || 'tente novamente.');
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Salvar Alterações';
  }
}

// ── Utilitários ───────────────────────────────────────────────────────────────
function showMsg(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => el.style.display = 'none', 4000);
}
function hideMsg(id) { document.getElementById(id).style.display = 'none'; }
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.querySelector('.btn-text').style.display = loading ? 'none' : '';
  btn.querySelector('.btn-loader').style.display = loading ? '' : 'none';
  btn.disabled = loading;
}
function logout() { sessionStorage.removeItem('cs_user'); window.location.href = 'login.html'; }
function formatDeliveryDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}
function escJs(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}