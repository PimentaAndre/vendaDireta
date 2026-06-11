// =============================================
//  producao.js – CarneSystem
//  Tela de Produção: apenas Kanban
// =============================================

const SUPABASE_URL = 'https://mqxoosnpmujkopcirtxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeG9vc25wbXVqa29wY2lydHhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzMDczOCwiZXhwIjoyMDk2NTA2NzM4fQ.C4bJED7drldgPUSusRVZtndQjx10wOJuLBO5XygNOEE';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let ordersMap = {}; // guarda todos os pedidos pelo id para o modal de detalhes

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'producao' && currentUser.role !== 'master') {
    return window.location.href = 'login.html';
  }
  // Master tem acesso ao kanban mas também tem link para painel master
  if (currentUser.role === 'master') {
    document.getElementById('btn-master').style.display = 'inline-flex';
    document.getElementById('btn-dashboard').style.display = 'inline-flex';
  }

  loadAllOrders();

  // ── Realtime ──
  sb.channel('orders-realtime')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => { loadAllOrders(); }
    )
    .subscribe();
});

// ── Utilitários de data de entrega ──────────────────────────────────────
function formatDeliveryDate(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function getDeliveryClass(iso) {
  if (!iso) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const delivery = new Date(iso + 'T00:00:00');
  const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)   return 'delivery-overdue';
  if (diffDays === 0) return 'delivery-today';
  if (diffDays === 1) return 'delivery-tomorrow';
  return 'delivery-ok';
}

function getDeliveryLabel(iso) {
  if (!iso) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const delivery = new Date(iso + 'T00:00:00');
  const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)   return ' ⚠️ Atrasado';
  if (diffDays === 0) return ' 🔥 Hoje!';
  if (diffDays === 1) return ' ⏰ Amanhã';
  return '';
}

// ── Utilitários ──────────────────────────────────────
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderLeftColor = isError ? 'var(--red)' : 'var(--success)';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3500);
}
function logout() {
  sessionStorage.removeItem('cs_user');
  window.location.href = 'login.html';
}

// ── Kanban: Carregar Todos os Pedidos ──────────────────────────────────────
async function loadAllOrders() {
  ['todo','progress','done'].forEach(s => {
    document.getElementById(`cards-${s}`).innerHTML = '<div class="kanban-empty">Carregando...</div>';
    document.getElementById(`count-${s}`).textContent = '0';
  });

  try {
    const { data: orders, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    ['todo','progress','done'].forEach(s => {
      document.getElementById(`cards-${s}`).innerHTML = '';
    });

    const counts = { todo: 0, progress: 0, done: 0 };

    if (!orders || orders.length === 0) {
      ['todo','progress','done'].forEach(s => {
        document.getElementById(`cards-${s}`).innerHTML = '<div class="kanban-empty">Nenhum pedido</div>';
      });
      return;
    }

    orders.forEach(o => {
      ordersMap[o.id] = o; // salva no mapa para o modal acessar depois
      const col = document.getElementById(`cards-${o.status}`);
      if (!col) return;
      counts[o.status] = (counts[o.status] || 0) + 1;

      const date = new Date(o.created_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      let cutsHtml = '';
      try {
        const cuts = JSON.parse(o.cuts_json || '[]');
        if (cuts.length > 0) {
          cutsHtml = cuts.map(c =>
            `<div class="kanban-cut-item">${c.code ? `<span class="cut-code-badge">${escHtml(c.code)}</span> ` : ''}🥩 <strong>${escHtml(c.type)}</strong> — ${String(c.qty).replace('.', ',')} kg</div>`
          ).join('');
        } else {
          cutsHtml = `<div class="kanban-cut-item">🥩 ${escHtml(o.cut_type)}</div>`;
        }
      } catch {
        cutsHtml = `<div class="kanban-cut-item">🥩 ${escHtml(o.cut_type)}</div>`;
      }

      let actions = '';
      if (o.status === 'todo') {
        actions = `
          <button class="btn-move" onclick="moveOrder('${o.id}', 'progress')">▶ Iniciar</button>
          <button class="btn btn-danger" onclick="removeOrder('${o.id}')">✕ Cancelar</button>`;
      } else if (o.status === 'progress') {
        actions = `
          <button class="btn-move" onclick="moveOrder('${o.id}', 'done')">✔ Concluir</button>
          <button class="btn btn-danger" onclick="removeOrder('${o.id}')">✕ Cancelar</button>`;
      } else {
        actions = '';
      }

      const orderData = escHtml(JSON.stringify(o));

      col.innerHTML += `
        <div class="kanban-card" id="card-${o.id}" onclick="openDetailModal('${o.id}')" data-order-id="${o.id}" style="cursor:pointer">
          <div class="kanban-card-header">
            <div class="kanban-card-client">${escHtml(o.client_name)}</div>
            <div class="kanban-card-id">#${o.id.slice(-5).toUpperCase()}</div>
          </div>
          <div class="kanban-cuts-list">${cutsHtml}</div>
          <div class="kanban-card-info" style="margin-top:6px">
            📦 Total: <strong style="color:var(--gold)">${String(o.quantity_kg).replace('.', ',')} kg</strong>
          </div>
          ${o.status === 'done'
            ? `<div class="kanban-card-delivery delivery-ok">✅ Concluído em: <strong>${o.completed_at ? new Date(o.completed_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</strong></div>`
            : o.delivery_date ? `<div class="kanban-card-delivery ${getDeliveryClass(o.delivery_date)}">📅 Entrega: <strong>${formatDeliveryDate(o.delivery_date)}</strong>${getDeliveryLabel(o.delivery_date)}</div>` : ''
          }
          ${o.observations ? `<div class="kanban-obs-hint">💬 Ver observações</div>` : ''}
          <div class="kanban-card-vendor">👤 ${escHtml(o.vendor_name)} · ${date}</div>
          <div class="kanban-card-actions" onclick="event.stopPropagation()">${actions}</div>
        </div>`;
    });

    ['todo','progress','done'].forEach(s => {
      document.getElementById(`count-${s}`).textContent = counts[s] || 0;
      if ((counts[s] || 0) === 0) {
        document.getElementById(`cards-${s}`).innerHTML = '<div class="kanban-empty">Nenhum pedido</div>';
      }
    });

  } catch (e) {
    console.error(e);
    showToast('Erro ao carregar pedidos.', true);
  }
}

// ── Mover / Remover pedido ──────────────────────────────────────
async function moveOrder(id, newStatus) {
  try {
    const updateData = { status: newStatus };
    if (newStatus === 'done') updateData.completed_at = new Date().toISOString();

    const { error } = await sb.from('orders').update(updateData).eq('id', id);
    if (error) throw error;
    const labels = { progress: 'Em Andamento', done: 'Concluído' };
    showToast(`Pedido movido para "${labels[newStatus]}"`);
    loadAllOrders();
  } catch (e) {
    console.error(e);
    showToast('Erro ao atualizar pedido.', true);
  }
}

async function removeOrder(id) {
  if (!confirm('Tem certeza que deseja remover/cancelar este pedido?')) return;
  try {
    const { error } = await sb.from('orders').delete().eq('id', id);
    if (error) throw error;
    showToast('Pedido removido.');
    loadAllOrders();
  } catch (e) {
    console.error(e);
    showToast('Erro ao remover pedido.', true);
  }
}
// ── Modal de Detalhes do Pedido ──────────────────────────────────────
function openDetailModal(orderId) {
  const o = ordersMap[orderId];
  if (!o) return;

  // ID e título
  document.getElementById('detail-title').textContent = o.client_name;
  document.getElementById('detail-id').textContent = '#' + o.id.slice(-5).toUpperCase();

  // Status badge
  const statusMap = {
    todo:     { label: 'A Fazer',      cls: 'status-todo' },
    progress: { label: 'Em Andamento', cls: 'status-progress' },
    done:     { label: 'Concluído',    cls: 'status-done' }
  };
  const st = statusMap[o.status] || statusMap.todo;
  const badge = document.getElementById('detail-status-badge');
  badge.textContent = st.label;
  badge.className = 'status-badge ' + st.cls;

  // Campos
  document.getElementById('detail-client').textContent  = o.client_name;
  document.getElementById('detail-vendor').textContent  = o.vendor_name;
  document.getElementById('detail-created').textContent = new Date(o.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('detail-delivery').textContent = o.delivery_date
    ? formatDeliveryDate(o.delivery_date) + getDeliveryLabel(o.delivery_date)
    : '—';

  // Cortes
  const cutsList = document.getElementById('detail-cuts-list');
  cutsList.innerHTML = '';
  let cuts = [];
  try { cuts = JSON.parse(o.cuts_json || '[]'); } catch { cuts = []; }
  if (cuts.length === 0 && o.cut_type) cuts = [{ type: o.cut_type, qty: o.quantity_kg }];
  cuts.forEach(c => {
    const row = document.createElement('div');
    row.className = 'detail-cut-row';
    row.innerHTML = `
      <span class="detail-cut-name">${c.code ? `<span class="cut-code-badge">${escHtml(c.code)}</span> ` : ''}🥩 ${escHtml(c.type)}</span>
      <span class="detail-cut-qty">${String(c.qty).replace('.', ',')} kg</span>`;
    cutsList.appendChild(row);
  });
  document.getElementById('detail-total-kg').textContent = String(o.quantity_kg).replace('.', ',') + ' kg';

  // Observações
  const obsWrap = document.getElementById('detail-obs-wrap');
  if (o.observations) {
    document.getElementById('detail-obs').textContent = o.observations;
    obsWrap.style.display = 'block';
  } else {
    obsWrap.style.display = 'none';
  }

  document.getElementById('modal-order-detail').style.display = 'flex';
}

function closeDetailModal() {
  document.getElementById('modal-order-detail').style.display = 'none';
}