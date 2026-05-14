// =============================================
//  login.js – CarneSystem
//  Configuração Supabase + lógica de login
// =============================================

// ⚠️  CONFIGURE AQUI suas credenciais do Supabase
const SUPABASE_URL = 'https://nxbfqozgsthxawrczlqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54YmZxb3pnc3RoeGF3cmN6bHFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNDQwNCwiZXhwIjoyMDk0MjgwNDA0fQ.Cpa4714pzyI9AEWgWeoT-OvsSYkWTmDcj5vp3gDLJyA';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Utilitários de UI
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError(id) {
  document.getElementById(id).style.display = 'none';
}
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.querySelector('.btn-text').style.display = loading ? 'none' : '';
  btn.querySelector('.btn-loader').style.display = loading ? '' : 'none';
  btn.disabled = loading;
}
function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

// ── Login ──────────────────────────────────────
async function handleLogin() {
  hideError('login-error');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    return showError('login-error', 'Preencha usuário e senha.');
  }

  setLoading('btn-login', true);

  try {
    // Busca usuário na tabela users
    const { data: users, error } = await sb
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !users) {
      setLoading('btn-login', false);
      return showError('login-error', 'Usuário não encontrado.');
    }

    // Verifica senha (hash simples via btoa – em produção use bcrypt no backend)
    const hashedInput = btoa(password);
    if (users.password_hash !== hashedInput) {
      setLoading('btn-login', false);
      return showError('login-error', 'Senha incorreta.');
    }

    // Salva sessão no sessionStorage
    sessionStorage.setItem('cs_user', JSON.stringify({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role  // 'master', 'producao' ou 'vendedor'
    }));

    // Redireciona conforme papel
    if (users.role === 'vendedor') {
      window.location.href = 'vendedor.html';
    } else if (users.role === 'producao' || users.role === 'master') {
      window.location.href = 'producao.html';
    }

  } catch (e) {
    setLoading('btn-login', false);
    showError('login-error', 'Erro ao conectar. Verifique as credenciais do Supabase.');
    console.error(e);
  }
}

// Enter para login
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('login-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});