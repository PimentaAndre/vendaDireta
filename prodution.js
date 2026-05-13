// =============================================
//  producao.js – CarneSystem
//  Tela de Produção: Kanban + Painel Master
// =============================================

const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'producao' && currentUser.role !== 'master') {
    return window.location.href = 'login.html';
  }

  // Painel master
  if (currentUser.role === 'master') {
    document.getElementById('master-panel').style.display = 'block';
    loadVendors();
  }

  loadAllOrders();
});

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

function setModalLoading(loading) {
  const btn = document.getElementById('btn-create-vendor');
  btn.querySelector('.btn-text').style.display = loading ? 'none' : '';
  btn.querySelector('.btn-loader').style.display = loading ? '' : 'none';
  btn.disabled = loading;
}

function logout() {
  sessionStorage.removeItem('cs_user');
  window.location.href = 'login.html';
}

// ── Kanban: Carregar Todos os Pedidos ──────────────────────────────────────
async function loadAllOrders() {
  // Limpa colunas
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
      const col = document.getElementById(`cards-${o.status}`);
      if (!col) return;
      counts[o.status] = (counts[o.status] || 0) + 1;

      const date = new Date(o.created_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      let actions = '';
      if (o.status === 'todo') {
        actions = `
          <button class="btn-move" onclick="moveOrder('${o.id}', 'progress')">▶ Iniciar</button>
          <button class="btn btn-danger" onclick="removeOrder('${o.id}')">✕ Cancelar</button>`;
      } else if (o.status === 'progress') {
        actions = `
          <button class="btn-move" onclick="moveOrder('${o.id}', 'done')">✔ Concluir</button>
          <button class="btn btn-danger" onclick="removeOrder('${o.id}')">✕ Cancelar</button>`;
      } else if (o.status === 'done') {
        actions = `<button class="btn btn-danger" onclick="removeOrder('${o.id}')">✕ Remover</button>`;
      }

      col.innerHTML += `
        <div class="kanban-card" id="card-${o.id}">
          <div class="kanban-card-header">
            <div class="kanban-card-client">${escHtml(o.client_name)}</div>
            <div class="kanban-card-id">#${o.id.slice(-5).toUpperCase()}</div>
          </div>
          <div class="kanban-card-cut">🥩 ${escHtml(o.cut_type)}</div>
          <div class="kanban-card-info">📦 ${o.quantity_kg} kg</div>
          ${o.observations ? `<div class="kanban-card-info" style="font-style:italic">💬 ${escHtml(o.observations)}</div>` : ''}
          <div class="kanban-card-vendor">👤 ${escHtml(o.vendor_name)} · ${date}</div>
          <div class="kanban-card-actions">${actions}</div>
        </div>`;
    });

    // Atualiza contadores e mensagens vazias
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

// ── Mover pedido de status ──────────────────────────────────────
async function moveOrder(id, newStatus) {
  try {
    const { error } = await sb
      .from('orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;

    const labels = { progress: 'Em Andamento', done: 'Concluído' };
    showToast(`Pedido movido para "${labels[newStatus] || newStatus}"`);
    loadAllOrders();

  } catch (e) {
    console.error(e);
    showToast('Erro ao atualizar pedido.', true);
  }
}

// ── Remover pedido ──────────────────────────────────────
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

// ── MASTER: Carregar Vendedores ──────────────────────────────────────
async function loadVendors() {
  document.getElementById('vendors-loading').style.display = 'block';
  document.getElementById('vendors-empty').style.display   = 'none';
  document.getElementById('vendors-list').style.display    = 'none';

  try {
    const { data: vendors, error } = await sb
      .from('users')
      .select('id, username, name, created_at')
      .eq('role', 'vendedor')
      .order('created_at', { ascending: false });

    if (error) throw error;

    document.getElementById('vendors-loading').style.display = 'none';

    if (!vendors || vendors.length === 0) {
      document.getElementById('vendors-empty').style.display = 'block';
      return;
    }

    document.getElementById('vendors-list').style.display = 'block';
    const tbody = document.getElementById('vendors-tbody');
    tbody.innerHTML = '';

    vendors.forEach(v => {
      const date = new Date(v.created_at).toLocaleDateString('pt-BR');
      tbody.innerHTML += `
        <tr>
          <td style="font-weight:600">${escHtml(v.username)}</td>
          <td>${escHtml(v.name)}</td>
          <td style="color:var(--text-muted);font-size:0.8rem">${date}</td>
          <td><button class="btn btn-danger" onclick="deleteVendor('${v.id}', '${escHtml(v.username)}')">✕ Remover</button></td>
        </tr>`;
    });

  } catch (e) {
    console.error(e);
    document.getElementById('vendors-loading').textContent = 'Erro ao carregar vendedores.';
  }
}

// ── MASTER: Criar Vendedor ──────────────────────────────────────
function openAddVendorModal() {
  document.getElementById('modal-vendor').style.display = 'flex';
  document.getElementById('modal-error').style.display   = 'none';
  document.getElementById('modal-success').style.display = 'none';
  document.getElementById('new-vendor-name').value     = '';
  document.getElementById('new-vendor-username').value  = '';
  document.getElementById('new-vendor-password').value  = '';
}
function closeAddVendorModal() {
  document.getElementById('modal-vendor').style.display = 'none';
}
function closeModalOutside(e) {
  if (e.target.classList.contains('modal-overlay')) closeAddVendorModal();
}

async function createVendor() {
  const name     = document.getElementById('new-vendor-name').value.trim();
  const username = document.getElementById('new-vendor-username').value.trim().toLowerCase();
  const password = document.getElementById('new-vendor-password').value;

  document.getElementById('modal-error').style.display   = 'none';
  document.getElementById('modal-success').style.display = 'none';

  if (!name)     return showModalError('Informe o nome completo.');
  if (!username) return showModalError('Informe o usuário de login.');
  if (!password || password.length < 6) return showModalError('A senha deve ter no mínimo 6 caracteres.');

  setModalLoading(true);

  try {
    // Verifica se username já existe
    const { data: existing } = await sb
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      setModalLoading(false);
      return showModalError('Este nome de usuário já está em uso.');
    }

    const password_hash = btoa(password);

    const { error } = await sb.from('users').insert([{
      username,
      name,
      password_hash,
      role: 'vendedor',
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    showModalSuccess('✅ Vendedor criado com sucesso!');
    setTimeout(() => {
      closeAddVendorModal();
      loadVendors();
    }, 1500);

  } catch (e) {
    console.error(e);
    showModalError('Erro ao criar vendedor: ' + (e.message || 'tente novamente.'));
  } finally {
    setModalLoading(false);
  }
}

function showModalError(msg) {
  const el = document.getElementById('modal-error');
  el.textContent = msg; el.style.display = 'block';
}
function showModalSuccess(msg) {
  const el = document.getElementById('modal-success');
  el.textContent = msg; el.style.display = 'block';
}

// ── MASTER: Deletar Vendedor ──────────────────────────────────────
async function deleteVendor(id, username) {
  if (!confirm(`Remover vendedor "${username}"? Isso não remove os pedidos.`)) return;

  try {
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw error;
    showToast(`Vendedor ${username} removido.`);
    loadVendors();
  } catch (e) {
    console.error(e);
    showToast('Erro ao remover vendedor.', true);
  }
}

// ── Toggle senha ──────────────────────────────────────
function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}