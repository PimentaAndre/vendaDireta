// =============================================
//  vendedor.js – CarneSystem
//  Tela do Vendedor: criar e visualizar pedidos
// =============================================

const SUPABASE_URL = 'https://nxbfqozgsthxawrczlqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54YmZxb3pnc3RoeGF3cmN6bHFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNDQwNCwiZXhwIjoyMDk0MjgwNDA0fQ.Cpa4714pzyI9AEWgWeoT-OvsSYkWTmDcj5vp3gDLJyA';


const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let cutRowCount = 0;

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
   const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'vendedor') return window.location.href = 'login.html';

  document.getElementById('header-username').textContent = currentUser.name || currentUser.username;

  addCutRow();
  loadMyOrders();

  // ── Realtime: escuta mudanças nos pedidos do vendedor ──
  sb.channel('orders-vendedor-realtime')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      (payload) => {
        if (payload.new?.vendor_id === currentUser.id || payload.old?.vendor_id === currentUser.id) {
          loadMyOrders();
        }
      }
    )
    .subscribe();
});

// ── Gerenciar linhas de corte ──────────────────────────────────────
function addCutRow() {
  cutRowCount++;
  const id = cutRowCount;
  const list = document.getElementById('cuts-list');

  const row = document.createElement('div');
  row.className = 'cut-row';
  row.id = `cut-row-${id}`;
  row.innerHTML = `
    <div class="cut-row-inner">
      <div class="input-group cut-input-cut">
        <label>Tipo de Corte *</label>
        <input type="text" id="cut-type-${id}" placeholder="Ex: Picanha, Fraldinha..." oninput="updateTotal()" />
      </div>
      <div class="input-group cut-input-qty">
        <label>Quantidade (kg) *</label>
        <input type="number" id="cut-qty-${id}" placeholder="Ex: 5.0" min="0.1" step="0.1" oninput="updateTotal()" />
      </div>
      <button class="btn-remove-cut" title="Remover corte" onclick="removeCutRow(${id})">✕</button>
    </div>`;

  list.appendChild(row);
  updateTotal();

  // Foca no campo de corte adicionado
  setTimeout(() => document.getElementById(`cut-type-${id}`).focus(), 50);
}

function removeCutRow(id) {
  const rows = document.querySelectorAll('.cut-row');
  if (rows.length <= 1) return; // mantém pelo menos 1
  document.getElementById(`cut-row-${id}`).remove();
  updateTotal();
}

function updateTotal() {
  const rows = document.querySelectorAll('.cut-row');
  let total = 0;
  rows.forEach(row => {
    const id = row.id.replace('cut-row-', '');
    const qty = parseFloat(document.getElementById(`cut-qty-${id}`)?.value) || 0;
    total += qty;
  });

  const totalEl = document.getElementById('cuts-total');
  const totalKg = document.getElementById('cuts-total-kg');
  if (total > 0) {
    totalEl.style.display = 'flex';
    totalKg.textContent = total.toFixed(2).replace('.', ',') + ' kg';
  } else {
    totalEl.style.display = 'none';
  }
}

function getCutRows() {
  const rows = document.querySelectorAll('.cut-row');
  const cuts = [];
  let valid = true;

  rows.forEach(row => {
    const id = row.id.replace('cut-row-', '');
    const type = document.getElementById(`cut-type-${id}`)?.value.trim();
    const qty  = parseFloat(document.getElementById(`cut-qty-${id}`)?.value);

    if (!type || !qty || qty <= 0) { valid = false; return; }
    cuts.push({ type, qty });
  });

  return valid ? cuts : null;
}

// ── Criar Pedido ──────────────────────────────────────
async function createOrder() {
  hideMsg('order-error');
  hideMsg('order-success');

  const client       = document.getElementById('order-client').value.trim();
  const obs          = document.getElementById('order-obs').value.trim();
  const deliveryDate = document.getElementById('order-delivery-date').value;
  const cuts         = getCutRows();

  if (!client)       return showMsg('order-error', 'Informe o nome do cliente.');
  if (!deliveryDate) return showMsg('order-error', 'Informe o dia de entrega.');
  if (!cuts || cuts.length === 0) return showMsg('order-error', 'Adicione pelo menos um corte com tipo e quantidade.');

  setLoading('btn-order', true);

  try {
    const totalKg = cuts.reduce((acc, c) => acc + c.qty, 0);

    // Formata cortes em texto para exibição no kanban
    const cutType = cuts.map(c => `${c.type} (${c.qty.toString().replace('.', ',')} kg)`).join(' | ');

    const { error } = await sb.from('orders').insert([{
      vendor_id:    currentUser.id,
      vendor_name:  currentUser.name || currentUser.username,
      client_name:  client,
      cut_type:     cutType,           // lista formatada de cortes
      cuts_json:    JSON.stringify(cuts), // JSON completo para detalhes
      quantity_kg:   parseFloat(totalKg.toFixed(2)),
      observations:  obs || null,
      delivery_date: deliveryDate,
      status:        'todo',
      created_at:   new Date().toISOString()
    }]);

    if (error) throw error;

    // Limpa formulário
    document.getElementById('order-client').value        = '';
    document.getElementById('order-delivery-date').value = '';
    document.getElementById('order-obs').value           = '';
    document.getElementById('cuts-list').innerHTML = '';
    cutRowCount = 0;
    addCutRow();

    showMsg('order-success', '✅ Pedido enviado para a produção com sucesso!', 'success');
    loadMyOrders();

  } catch (e) {
    console.error(e);
    showMsg('order-error', 'Erro ao criar pedido: ' + (e.message || 'tente novamente.'));
  } finally {
    setLoading('btn-order', false);
  }
}

// ── Carregar Meus Pedidos ──────────────────────────────────────
async function loadMyOrders() {
  document.getElementById('my-orders-loading').style.display = 'block';
  document.getElementById('my-orders-empty').style.display   = 'none';
  document.getElementById('my-orders-list').style.display    = 'none';

  try {
    const { data: orders, error } = await sb
      .from('orders')
      .select('*')
      .eq('vendor_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    document.getElementById('my-orders-loading').style.display = 'none';

    if (!orders || orders.length === 0) {
      document.getElementById('my-orders-empty').style.display = 'block';
      return;
    }

    document.getElementById('my-orders-list').style.display = 'block';
    const tbody = document.getElementById('my-orders-tbody');
    tbody.innerHTML = '';

    orders.forEach((o, i) => {
      const date = new Date(o.created_at).toLocaleString('pt-BR');
      const statusMap = {
        todo:     { label: 'A Fazer',      cls: 'status-todo' },
        progress: { label: 'Em Andamento', cls: 'status-progress' },
        done:     { label: 'Concluído',    cls: 'status-done' }
      };
      const st = statusMap[o.status] || statusMap.todo;

      // Monta lista de cortes
      let cutsHtml = '';
      try {
        const cuts = JSON.parse(o.cuts_json || '[]');
        cutsHtml = cuts.map(c =>
          `<div class="cut-tag">🥩 ${escHtml(c.type)} <span>${c.qty.toString().replace('.', ',')} kg</span></div>`
        ).join('');
      } catch {
        cutsHtml = `<div class="cut-tag">🥩 ${escHtml(o.cut_type)}</div>`;
      }

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
        </tr>`;
    });

  } catch (e) {
    console.error(e);
    document.getElementById('my-orders-loading').textContent = 'Erro ao carregar pedidos.';
  }
}

// ── Utilitários ──────────────────────────────────────
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
function logout() {
  sessionStorage.removeItem('cs_user');
  window.location.href = 'login.html';
}
function formatDeliveryDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}