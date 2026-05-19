// =============================================
//  producao.js – CarneSystem
//  Tela de Produção: Kanban + Painel Master
// =============================================

const SUPABASE_URL = 'https://nxbfqozgsthxawrczlqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54YmZxb3pnc3RoeGF3cmN6bHFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNDQwNCwiZXhwIjoyMDk0MjgwNDA0fQ.Cpa4714pzyI9AEWgWeoT-OvsSYkWTmDcj5vp3gDLJyA';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let pwModalUserId = null;  // id do usuário no modal de senha

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';
 
  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'producao' && currentUser.role !== 'master') {
    return window.location.href = 'login.html';
  }
 
  if (currentUser.role === 'master') {
    document.getElementById('master-panel').style.display = 'block';
    document.getElementById('btn-dashboard').style.display = 'inline-flex';
    loadVendors();
  }
 
  loadAllOrders();

  sb.channel('orders-realtime')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'orders' },
      () => { loadAllOrders(); }
    )
    .subscribe();
});
 
// ── Tabs do painel master ──────────────────────────────────────
function switchTab(tab) {
  document.getElementById('panel-vendedores').style.display = tab === 'vendedores' ? 'block' : 'none';
  document.getElementById('panel-producao').style.display   = tab === 'producao'   ? 'block' : 'none';
  document.getElementById('tab-vendedores').classList.toggle('active', tab === 'vendedores');
  document.getElementById('tab-producao').classList.toggle('active',   tab === 'producao');
 
  if (tab === 'producao') loadProducaoUsers();
}
 
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
  if (diffDays < 0)  return 'delivery-overdue';   // atrasado
  if (diffDays === 0) return 'delivery-today';     // hoje
  if (diffDays === 1) return 'delivery-tomorrow';  // amanhã
  return 'delivery-ok';                            // com prazo
}

function getDeliveryLabel(iso) {
  if (!iso) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const delivery = new Date(iso + 'T00:00:00');
  const diffDays = Math.ceil((delivery - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)  return ' ⚠️ Atrasado';
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
function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}
function closeModalOutside(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId === 'modal-vendor') closeAddVendorModal();
    if (modalId === 'modal-password') closePasswordModal();
  }
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
      const col = document.getElementById(`cards-${o.status}`);
      if (!col) return;
      counts[o.status] = (counts[o.status] || 0) + 1;
 
      const date = new Date(o.created_at).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
 
      // Monta lista de cortes do kanban
      let cutsHtml = '';
      try {
        const cuts = JSON.parse(o.cuts_json || '[]');
        if (cuts.length > 0) {
          cutsHtml = cuts.map(c =>
            `<div class="kanban-cut-item">🥩 <strong>${escHtml(c.type)}</strong> — ${String(c.qty).replace('.', ',')} kg</div>`
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
 
      col.innerHTML += `
        <div class="kanban-card" id="card-${o.id}">
          <div class="kanban-card-header">
            <div class="kanban-card-client">${escHtml(o.client_name)}</div>
            <div class="kanban-card-id">#${o.id.slice(-5).toUpperCase()}</div>
          </div>
          <div class="kanban-cuts-list">${cutsHtml}</div>
          <div class="kanban-card-info" style="margin-top:6px">
            📦 Total: <strong style="color:var(--gold)">${String(o.quantity_kg).replace('.', ',')} kg</strong>
          </div>
          ${o.observations ? `<div class="kanban-card-info" style="font-style:italic;margin-top:4px">💬 ${escHtml(o.observations)}</div>` : ''}
          ${o.delivery_date ? `<div class="kanban-card-delivery ${getDeliveryClass(o.delivery_date)}">📅 Entrega: <strong>${formatDeliveryDate(o.delivery_date)}</strong>${getDeliveryLabel(o.delivery_date)}</div>` : ''}
          <div class="kanban-card-vendor">👤 ${escHtml(o.vendor_name)} · ${date}</div>
          <div class="kanban-card-actions">${actions}</div>
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
 
// ── MASTER: Carregar Vendedores ──────────────────────────────────────
async function loadVendors() {
  document.getElementById('vendors-loading').style.display = 'block';
  document.getElementById('vendors-empty').style.display   = 'none';
  document.getElementById('vendors-list').style.display    = 'none';
 
  try {
    const { data: vendors, error } = await sb
      .from('users')
      .select('id, username, name, password_hash, created_at')
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
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openPasswordModal('${v.id}', '${escHtml(v.username)}', '${escHtml(v.password_hash)}')">
              🔑 Ver / Alterar
            </button>
          </td>
          <td>
            <button class="btn btn-danger" onclick="deleteVendor('${v.id}', '${escHtml(v.username)}')">✕ Remover</button>
          </td>
        </tr>`;
    });
 
  } catch (e) {
    console.error(e);
    document.getElementById('vendors-loading').textContent = 'Erro ao carregar vendedores.';
  }
}
 
// ── MASTER: Carregar Usuários de Produção ──────────────────────────────────────
async function loadProducaoUsers() {
  document.getElementById('producao-loading').style.display = 'block';
  document.getElementById('producao-empty').style.display   = 'none';
  document.getElementById('producao-list').style.display    = 'none';
 
  try {
    const { data: users, error } = await sb
      .from('users')
      .select('id, username, name, password_hash, created_at')
      .in('role', ['producao', 'master'])
      .order('created_at', { ascending: false });
 
    if (error) throw error;
 
    document.getElementById('producao-loading').style.display = 'none';
 
    if (!users || users.length === 0) {
      document.getElementById('producao-empty').style.display = 'block';
      return;
    }
 
    document.getElementById('producao-list').style.display = 'block';
    const tbody = document.getElementById('producao-tbody');
    tbody.innerHTML = '';
 
    users.forEach(u => {
      const date = new Date(u.created_at).toLocaleDateString('pt-BR');
      const roleBadge = u.role === 'master'
        ? '<span class="role-mini-badge master">Master</span>'
        : '<span class="role-mini-badge producao">Produção</span>';
 
      tbody.innerHTML += `
        <tr>
          <td style="font-weight:600">${escHtml(u.username)} ${roleBadge}</td>
          <td>${escHtml(u.name)}</td>
          <td style="color:var(--text-muted);font-size:0.8rem">${date}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="openPasswordModal('${u.id}', '${escHtml(u.username)}', '${escHtml(u.password_hash)}')">
              🔑 Ver / Alterar
            </button>
          </td>
          <td style="color:var(--text-muted);font-size:0.8rem">—</td>
        </tr>`;
    });
 
  } catch (e) {
    console.error(e);
    document.getElementById('producao-loading').textContent = 'Erro ao carregar usuários.';
  }
}
 
// ── MASTER: Modal Senha ──────────────────────────────────────
function openPasswordModal(userId, username, passwordHash) {
  pwModalUserId = userId;
  document.getElementById('pw-modal-username').value = username;
 
  // Decodifica base64 para mostrar a senha atual
  try {
    document.getElementById('pw-modal-current').value = atob(passwordHash);
  } catch {
    document.getElementById('pw-modal-current').value = '(não foi possível decodificar)';
  }
 
  document.getElementById('pw-modal-new').value      = '';
  document.getElementById('pw-modal-error').style.display   = 'none';
  document.getElementById('pw-modal-success').style.display = 'none';
  document.getElementById('modal-password').style.display   = 'flex';
}
 
function closePasswordModal() {
  document.getElementById('modal-password').style.display = 'none';
  pwModalUserId = null;
}
 
async function saveNewPassword() {
  const newPw = document.getElementById('pw-modal-new').value;
  document.getElementById('pw-modal-error').style.display   = 'none';
  document.getElementById('pw-modal-success').style.display = 'none';
 
  if (!newPw || newPw.length < 6) {
    const el = document.getElementById('pw-modal-error');
    el.textContent = 'A nova senha deve ter no mínimo 6 caracteres.';
    el.style.display = 'block';
    return;
  }
 
  const btn = document.getElementById('btn-save-password');
  btn.querySelector('.btn-text').style.display  = 'none';
  btn.querySelector('.btn-loader').style.display = '';
  btn.disabled = true;
 
  try {
    const newHash = btoa(newPw);
    const { error } = await sb
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', pwModalUserId);
 
    if (error) throw error;
 
    // Atualiza campo de senha atual no modal
    document.getElementById('pw-modal-current').value = newPw;
    document.getElementById('pw-modal-new').value = '';
 
    const el = document.getElementById('pw-modal-success');
    el.textContent = '✅ Senha alterada com sucesso!';
    el.style.display = 'block';
    showToast('Senha alterada com sucesso!');
 
  } catch (e) {
    console.error(e);
    const el = document.getElementById('pw-modal-error');
    el.textContent = 'Erro ao salvar senha: ' + (e.message || 'tente novamente.');
    el.style.display = 'block';
  } finally {
    btn.querySelector('.btn-text').style.display  = '';
    btn.querySelector('.btn-loader').style.display = 'none';
    btn.disabled = false;
  }
}
 
// ── MASTER: Criar Vendedor ──────────────────────────────────────
function openAddVendorModal() {
  document.getElementById('modal-vendor').style.display   = 'flex';
  document.getElementById('modal-error').style.display    = 'none';
  document.getElementById('modal-success').style.display  = 'none';
  document.getElementById('new-vendor-name').value        = '';
  document.getElementById('new-vendor-username').value    = '';
  document.getElementById('new-vendor-password').value    = '';
}
function closeAddVendorModal() {
  document.getElementById('modal-vendor').style.display = 'none';
}
 
function setModalLoading(loading) {
  const btn = document.getElementById('btn-create-vendor');
  btn.querySelector('.btn-text').style.display  = loading ? 'none' : '';
  btn.querySelector('.btn-loader').style.display = loading ? '' : 'none';
  btn.disabled = loading;
}
function showModalError(msg) {
  const el = document.getElementById('modal-error');
  el.textContent = msg; el.style.display = 'block';
}
function showModalSuccess(msg) {
  const el = document.getElementById('modal-success');
  el.textContent = msg; el.style.display = 'block';
}
 
async function createVendor() {
  const name     = document.getElementById('new-vendor-name').value.trim();
  const username = document.getElementById('new-vendor-username').value.trim().toLowerCase();
  const password = document.getElementById('new-vendor-password').value;
 
  document.getElementById('modal-error').style.display  = 'none';
  document.getElementById('modal-success').style.display = 'none';
 
  if (!name)     return showModalError('Informe o nome completo.');
  if (!username) return showModalError('Informe o usuário de login.');
  if (!password || password.length < 6) return showModalError('A senha deve ter no mínimo 6 caracteres.');
 
  setModalLoading(true);
 
  try {
    const { data: existing } = await sb
      .from('users').select('id').eq('username', username).maybeSingle();
 
    if (existing) {
      setModalLoading(false);
      return showModalError('Este nome de usuário já está em uso.');
    }
 
    const { error } = await sb.from('users').insert([{
      username,
      name,
      password_hash: btoa(password),
      role: 'vendedor',
      created_at: new Date().toISOString()
    }]);
 
    if (error) throw error;
 
    showModalSuccess('✅ Vendedor criado com sucesso!');
    setTimeout(() => { closeAddVendorModal(); loadVendors(); }, 1500);
 
  } catch (e) {
    console.error(e);
    showModalError('Erro ao criar vendedor: ' + (e.message || 'tente novamente.'));
  } finally {
    setModalLoading(false);
  }
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