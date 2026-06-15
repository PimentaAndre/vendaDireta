// =============================================
//  vendedor.js – CarneSystem
// =============================================

const SUPABASE_URL = 'https://mqxoosnpmujkopcirtxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeG9vc25wbXVqa29wY2lydHhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzMDczOCwiZXhwIjoyMDk2NTA2NzM4fQ.C4bJED7drldgPUSusRVZtndQjx10wOJuLBO5XygNOEE';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let cutRowCount = 0;
let editingOrderId = null;

// ── Catálogo de Carnes ────────────────────────────────────────────────────────
let MEAT_CATALOG = {
  '00881': 'ACEM C/PEITO S/OSSO CONG.', '00692': 'ACEM PDC CONG.',
  '9': 'ACEM RESFRIADO', '571': 'ACEM BOV S/ OSSO',
  '775': 'BIFE DE PRIMEIRA', '678': 'BIFE DE PRIMEIRA 60G',
  '03238': 'BIFE DE PRIMEIRA CONGELADO', '3188': 'BIFE DE PALETA BOVINA',
  '1124': 'BISTECA BOV. PAULISTA', '03220': 'CARNE MOIDA DE PRIMEIRA CONGELADA',
  '00774': 'CARNE MOIDA DE PRIMEIRA CONG.PCTO', '03054': 'CARNE MOIDA (ACEM/PEITO)',
  '75': 'CARNE MOIDA DE PRIMEIRA', '109': 'CARNE MOIDA ESPECIAL',
  '80': 'CARNE MOIDA DE SEGUNDA', '03190': 'CARNE MOIDA CONG.( DT BOV )',
  '3403': 'CARNE MOIDA (ACEM/PEITO) PACOTE', '1109': 'COSTELA BOVINA SERRADA',
  '72': 'CUBO BOVINO ESPECIAL', '03239': 'CUBO BOVINO ESPECIAL CONGELADO',
  '3189': 'CUBO BOVINO', '800': 'CUPIM CONGELADO',
  '673': 'DIANTEIRO BOV SERRADO', '987': 'ISCA BOVINA',
  '179': 'ISCA BOVINA DE PRIMEIRA PCT DE 1KG', '03237': 'ISCA BOVINA CONGELADA',
  '883': 'PALETA BOV.S/ OSSO CONGELADA', '28': 'PALETA BOV.S/ OSSO RESFRIADA',
  '3422': 'PALETA BOV RESF. S/MUSCULO', '2775': 'PALETA BOV S/ OSSO A VACUO',
  '572': 'PALETA BOV S/ OSSO', '557': 'PEITO BOV S/OSSO ',
  '00121': 'RETALHO DE SEGUNDA',
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
  const obs = document.getElementById('order-obs').value.trim();
  const deliveryDate = document.getElementById('order-delivery-date').value;
  const cuts = getCutRows();

  if (!client) return showMsg('order-error', 'Informe o nome do cliente.');
  if (!deliveryDate) return showMsg('order-error', 'Informe o dia de entrega.');
  if (!cuts) return showMsg('order-error', 'Preencha todos os cortes com nome e quantidade.');
  if (!cuts.length) return showMsg('order-error', 'Adicione pelo menos um corte.');

  setLoading('btn-order', true);
  try {
    const totalKg = cuts.reduce((s, c) => s + c.qty, 0);
    const cutType = cuts.map(c => `${c.code ? '[' + c.code + '] ' : ''}${c.type} (${c.qty.toString().replace('.', ',')} kg)`).join(' | ');

    const { error } = await sb.from('orders').insert([{
      vendor_id: currentUser.id,
      vendor_name: currentUser.name || currentUser.username,
      client_name: client,
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

    if (!orders || !orders.length) {
      document.getElementById('my-orders-empty').style.display = 'block';
      return;
    }

    document.getElementById('my-orders-list').style.display = 'block';
    const tbody = document.getElementById('my-orders-tbody');
    tbody.innerHTML = '';

    const statusMap = {
      todo: { label: 'A Fazer', cls: 'status-todo' },
      progress: { label: 'Em Andamento', cls: 'status-progress' },
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
          <td class="cuts-cell">${cutsHtml}</td>
          <td style="color:var(--gold);font-weight:600">${String(o.quantity_kg).replace('.', ',')} kg</td>
          <td style="color:var(--text-muted)">${o.observations ? escHtml(o.observations) : '–'}</td>
          <td style="color:var(--gold);font-weight:600">${o.delivery_date ? formatDeliveryDate(o.delivery_date) : '–'}</td>
          <td><span class="status-badge ${st.cls}">${st.label}</span></td>
          <td style="color:var(--text-muted);font-size:0.8rem">${date}</td>
          <td>${editBtn}</td>
        </tr>`;
    });

  } catch (e) {
    console.error(e);
    document.getElementById('my-orders-loading').textContent = 'Erro ao carregar pedidos.';
  }
}

// ── Modal de Edição ───────────────────────────────────────────────────────────
async function openEditModal(orderId) {
  const { data: o, error } = await sb.from('orders').select('*').eq('id', orderId).single();
  if (error || !o) return;

  editingOrderId = orderId;

  document.getElementById('edit-client').value = o.client_name;
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
  const deliveryDate = document.getElementById('edit-delivery').value;
  const obs = document.getElementById('edit-obs').value.trim();
  const cuts = getEditCutRows();
  const errEl = document.getElementById('edit-error');

  errEl.style.display = 'none';
  if (!client) { errEl.textContent = 'Informe o nome do cliente.'; errEl.style.display = 'block'; return; }
  if (!deliveryDate) { errEl.textContent = 'Informe a data de entrega.'; errEl.style.display = 'block'; return; }
  if (!cuts) { errEl.textContent = 'Preencha todos os cortes.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('btn-save-edit');
  btn.disabled = true;
  btn.textContent = '⏳ Salvando...';

  try {
    const totalKg = cuts.reduce((s, c) => s + c.qty, 0);
    const cutType = cuts.map(c => `${c.code ? '[' + c.code + '] ' : ''}${c.type} (${c.qty.toString().replace('.', ',')} kg)`).join(' | ');

    const { error } = await sb.from('orders').update({
      client_name: client,
      cut_type: cutType,
      cuts_json: JSON.stringify(cuts),
      quantity_kg: parseFloat(totalKg.toFixed(2)),
      observations: obs || null,
      delivery_date: deliveryDate,
    }).eq('id', editingOrderId);

    if (error) throw error;

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