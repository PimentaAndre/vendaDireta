// =============================================
//  vendedor.js – CarneSystem
//  Tela do Vendedor: criar e visualizar pedidos
// =============================================

const SUPABASE_URL = 'https://nxbfqozgsthxawrczlqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54YmZxb3pnc3RoeGF3cmN6bHFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNDQwNCwiZXhwIjoyMDk0MjgwNDA0fQ.Cpa4714pzyI9AEWgWeoT-OvsSYkWTmDcj5vp3gDLJyA';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'vendedor') return window.location.href = 'login.html';

  document.getElementById('header-username').textContent = currentUser.name || currentUser.username;
  loadMyOrders();
});

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

// ── Criar Pedido ──────────────────────────────────────
async function createOrder() {
  hideMsg('order-error');
  hideMsg('order-success');

  const client = document.getElementById('order-client').value.trim();
  const cut    = document.getElementById('order-cut').value.trim();
  const qty    = parseFloat(document.getElementById('order-qty').value);
  const obs    = document.getElementById('order-obs').value.trim();

  if (!client) return showMsg('order-error', 'Informe o nome do cliente.');
  if (!cut)    return showMsg('order-error', 'Informe o tipo de corte.');
  if (!qty || qty <= 0) return showMsg('order-error', 'Informe uma quantidade válida.');

  setLoading('btn-order', true);

  try {
    const { error } = await sb.from('orders').insert([{
      vendor_id: currentUser.id,
      vendor_name: currentUser.name || currentUser.username,
      client_name: client,
      cut_type: cut,
      quantity_kg: qty,
      observations: obs || null,
      status: 'todo',
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    // Limpa formulário
    document.getElementById('order-client').value = '';
    document.getElementById('order-cut').value    = '';
    document.getElementById('order-qty').value    = '';
    document.getElementById('order-obs').value    = '';

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

      tbody.innerHTML += `
        <tr>
          <td style="color:var(--text-muted);font-size:0.75rem">#${i + 1}</td>
          <td><strong>${escHtml(o.client_name)}</strong></td>
          <td style="color:var(--gold)">${escHtml(o.cut_type)}</td>
          <td>${o.quantity_kg} kg</td>
          <td style="color:var(--text-muted)">${o.observations ? escHtml(o.observations) : '–'}</td>
          <td><span class="status-badge ${st.cls}">${st.label}</span></td>
          <td style="color:var(--text-muted);font-size:0.8rem">${date}</td>
        </tr>`;
    });

  } catch (e) {
    console.error(e);
    document.getElementById('my-orders-loading').textContent = 'Erro ao carregar pedidos.';
  }
}

function logout() {
  sessionStorage.removeItem('cs_user');
  window.location.href = 'login.html';
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}