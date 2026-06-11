// =============================================
//  master.js – CarneSystem
//  Painel Master: Gerenciamento de Usuários
// =============================================

const SUPABASE_URL = 'https://mqxoosnpmujkopcirtxk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xeG9vc25wbXVqa29wY2lydHhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDkzMDczOCwiZXhwIjoyMDk2NTA2NzM4fQ.C4bJED7drldgPUSusRVZtndQjx10wOJuLBO5XygNOEE';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let pwModalUserId = null;

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'master') {
    return window.location.href = 'login.html';
  }

  loadVendors();
});

// ── Tabs ──────────────────────────────────────
function switchTab(tab) {
  const tabs = ['vendedores', 'supervisores', 'diretores', 'producao'];
  tabs.forEach(t => {
    const panel = document.getElementById(`panel-${t}`);
    const btn   = document.getElementById(`tab-${t}`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn)   btn.classList.toggle('active', t === tab);
  });

  if (tab === 'producao')    loadProducaoUsers();
  if (tab === 'supervisores') loadRoleUsers('supervisor');
  if (tab === 'diretores')   loadRoleUsers('diretor');
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
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.setAttribute('data-state', 'hide');
  } else {
    inp.type = 'password';
    btn.setAttribute('data-state', 'show');
  }
}
function closeModalOutside(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId === 'modal-vendor') closeAddVendorModal();
    if (modalId === 'modal-password') closePasswordModal();
  }
}

// ── Carregar Vendedores ──────────────────────────────────────
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

// ── Carregar Supervisores / Diretores (genérico) ──────────────────────────────────────
async function loadRoleUsers(role) {
  const panelKey = role === 'supervisor' ? 'supervisores' : 'diretores';
  document.getElementById(`${panelKey}-loading`).style.display = 'block';
  document.getElementById(`${panelKey}-empty`).style.display   = 'none';
  document.getElementById(`${panelKey}-list`).style.display    = 'none';

  try {
    const { data: users, error } = await sb
      .from('users')
      .select('id, username, name, password_hash, created_at')
      .eq('role', role)
      .order('created_at', { ascending: false });

    if (error) throw error;

    document.getElementById(`${panelKey}-loading`).style.display = 'none';

    if (!users || users.length === 0) {
      document.getElementById(`${panelKey}-empty`).style.display = 'block';
      return;
    }

    document.getElementById(`${panelKey}-list`).style.display = 'block';
    const tbody = document.getElementById(`${panelKey}-tbody`);
    tbody.innerHTML = '';

    users.forEach(v => {
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
    document.getElementById(`${panelKey}-loading`).textContent = 'Erro ao carregar usuários.';
  }
}
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

// ── Modal Senha ──────────────────────────────────────
function openPasswordModal(userId, username, passwordHash) {
  pwModalUserId = userId;
  document.getElementById('pw-modal-username').value = username;
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

// ── Modal Criar Vendedor ──────────────────────────────────────
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
  const role     = document.getElementById('new-vendor-role').value;
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
      role,
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;

    const roleLabels = {
      vendedor:   'Vendedor',
      supervisor: 'Supervisor',
      diretor:    'Diretor',
      producao:   'Produção'
    };
    showModalSuccess(`✅ ${roleLabels[role] || 'Usuário'} criado com sucesso!`);

    // Recarrega a aba correta
    setTimeout(() => {
      closeAddVendorModal();
      if (role === 'vendedor')   loadVendors();
      else if (role === 'supervisor') loadRoleUsers('supervisor');
      else if (role === 'diretor')    loadRoleUsers('diretor');
      else if (role === 'producao')   loadProducaoUsers();
    }, 1500);

  } catch (e) {
    console.error(e);
    showModalError('Erro ao criar usuário: ' + (e.message || 'tente novamente.'));
  } finally {
    setModalLoading(false);
  }
}

// ── Deletar Vendedor ──────────────────────────────────────
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