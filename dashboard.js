// =============================================
//  dashboard.js – CarneSystem
//  Dashboard Master: gráficos + exportação Excel
// =============================================

const SUPABASE_URL = 'https://nxbfqozgsthxawrczlqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54YmZxb3pnc3RoeGF3cmN6bHFyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODcwNDQwNCwiZXhwIjoyMDk0MjgwNDA0fQ.Cpa4714pzyI9AEWgWeoT-OvsSYkWTmDcj5vp3gDLJyA';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let allOrders   = [];   // cache completo dos pedidos
let charts      = {};   // instâncias Chart.js
let vendorMetric = 'orders'; // 'orders' | 'kg'

// ── Paleta de cores para gráficos ─────────────────
const COLORS = [
  '#C0392B','#c9a84c','#2980B9','#27AE60','#8E44AD',
  '#E67E22','#16A085','#D35400','#2C3E50','#F39C12'
];

// ── Init ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const raw = sessionStorage.getItem('cs_user');
  if (!raw) return window.location.href = 'login.html';

  currentUser = JSON.parse(raw);
  if (currentUser.role !== 'master') return window.location.href = 'login.html';

  populateYearFilter();
  await loadDashboard();
});

// ── Popular filtro de anos ──────────────────────────────────────
function populateYearFilter() {
  const sel = document.getElementById('filter-year');
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const ANO_MINIMO = 2026;
  const MAX_ANOS = 500;    

  let anoInicial = anoAtual - MAX_ANOS + 1; 
  if (anoInicial < ANO_MINIMO) {
    anoInicial = ANO_MINIMO;
  }

  if (anoInicial > anoAtual) anoInicial = anoAtual;

  sel.innerHTML = '';

  for (let y = anoAtual; y >= anoInicial; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    sel.appendChild(opt);
  }
}

// ── Filtrar pedidos pelo período selecionado ──────────────────────────────────────
function getFilteredOrders() {
  const month = document.getElementById('filter-month').value;
  const year  = parseInt(document.getElementById('filter-year').value);

  if (month === 'all') return allOrders;

  return allOrders.filter(o => {
    const d = new Date(o.created_at);
    return d.getMonth() === parseInt(month) && d.getFullYear() === year;
  });
}

// ── Carregar todos os dados ──────────────────────────────────────
async function loadDashboard() {
  document.getElementById('dash-loading').style.display = 'flex';
  document.getElementById('dash-main').style.display    = 'none';

  try {
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    allOrders = data || [];
    renderDashboard();

  } catch (e) {
    console.error(e);
    document.getElementById('dash-loading').innerHTML =
      '<div class="dash-loading-inner" style="color:var(--red)">❌ Erro ao carregar dados. Verifique as credenciais do Supabase.</div>';
  }
}

// ── Renderizar todo o dashboard ──────────────────────────────────────
function renderDashboard() {
  const orders = getFilteredOrders();

  document.getElementById('dash-loading').style.display = 'none';
  document.getElementById('dash-main').style.display    = 'flex';

  renderKPIs(orders);
  renderVendorChart(orders);
  renderCutsChart(orders);
  renderTimeChart(orders);
  renderStatusChart(orders);
  renderTimelineChart(orders);
  renderReportTable(orders);
}

// ── KPIs ──────────────────────────────────────
function renderKPIs(orders) {
  const total     = orders.length;
  const done      = orders.filter(o => o.status === 'done').length;
  const totalKg   = orders.reduce((s, o) => s + (parseFloat(o.quantity_kg) || 0), 0);
  const avgTime   = calcAvgTime(orders);

  // Vendedor destaque (mais pedidos)
  const vCount = {};
  orders.forEach(o => { vCount[o.vendor_name] = (vCount[o.vendor_name] || 0) + 1; });
  const topVendor = Object.entries(vCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

  document.getElementById('kpi-total-orders').textContent = total;
  document.getElementById('kpi-done-orders').textContent  = done;
  document.getElementById('kpi-total-kg').textContent     = totalKg.toLocaleString('pt-BR', {maximumFractionDigits:1}) + ' kg';
  document.getElementById('kpi-avg-time').textContent     = avgTime;
  document.getElementById('kpi-top-vendor').textContent   = topVendor;
}

// ── Calcular tempo médio de produção (criado → concluído) ──────────────────────────────────────
// Como não temos campo updated_at separado, usamos created_at + status 'done'
// Precisaríamos de um campo completed_at. Por ora, estimamos com base nos dados disponíveis.
function calcAvgTime(orders) {
  // Filtra pedidos concluídos que tenham completed_at
  const done = orders.filter(o => o.status === 'done' && o.completed_at);
  if (done.length === 0) return '—';

  const avgMs = done.reduce((sum, o) => {
    const diff = new Date(o.completed_at) - new Date(o.created_at);
    return sum + diff;
  }, 0) / done.length;

  const hours = avgMs / 3600000;
  if (hours < 1)   return Math.round(hours * 60) + ' min';
  if (hours < 24)  return hours.toFixed(1).replace('.', ',') + ' h';
  return (hours / 24).toFixed(1).replace('.', ',') + ' dias';
}

// ── Gráfico: Ranking de Vendedores ──────────────────────────────────────
function renderVendorChart(orders) {
  const byVendor = {};
  orders.forEach(o => {
    if (!byVendor[o.vendor_name]) byVendor[o.vendor_name] = { orders: 0, kg: 0 };
    byVendor[o.vendor_name].orders++;
    byVendor[o.vendor_name].kg += parseFloat(o.quantity_kg) || 0;
  });

  const sorted = Object.entries(byVendor)
    .sort((a,b) => b[1][vendorMetric] - a[1][vendorMetric]);

  const labels = sorted.map(([name]) => name);
  const values = sorted.map(([, v]) => vendorMetric === 'kg'
    ? parseFloat(v.kg.toFixed(1))
    : v.orders);

  const sub = vendorMetric === 'kg' ? 'por kg vendidos' : 'por nº de pedidos';
  document.getElementById('chart-vendor-sub').textContent = sub;

  destroyChart('vendors');
  const ctx = document.getElementById('chart-vendors').getContext('2d');
  charts.vendors = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: vendorMetric === 'kg' ? 'Kg vendidos' : 'Pedidos',
        data: values,
        backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length] + 'CC'),
        borderColor:     labels.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      ...baseChartOptions(),
      indexAxis: labels.length > 5 ? 'y' : 'x',
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false }
      }
    }
  });
}

function switchVendorMetric(metric, btn) {
  vendorMetric = metric;
  document.querySelectorAll('.chart-tabs .chart-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderVendorChart(getFilteredOrders());
}

// ── Gráfico: Cortes mais pedidos ──────────────────────────────────────
function renderCutsChart(orders) {
  const byCut = {};
  orders.forEach(o => {
    try {
      const cuts = JSON.parse(o.cuts_json || '[]');
      cuts.forEach(c => {
        const key = c.type.trim();
        byCut[key] = (byCut[key] || 0) + (parseFloat(c.qty) || 0);
      });
    } catch {
      // fallback para pedidos antigos sem cuts_json
      const key = o.cut_type?.split('(')[0].trim() || 'Outros';
      byCut[key] = (byCut[key] || 0) + (parseFloat(o.quantity_kg) || 0);
    }
  });

  const sorted = Object.entries(byCut).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => parseFloat(v.toFixed(1)));

  destroyChart('cuts');
  const ctx = document.getElementById('chart-cuts').getContext('2d');
  charts.cuts = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: COLORS.map(c => c + 'CC'),
        borderColor:     COLORS,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#8a8070', font: { size: 11, family: 'DM Sans' }, boxWidth: 12, padding: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('pt-BR')} kg`
          }
        }
      }
    }
  });
}

// ── Gráfico: Tempo médio por vendedor ──────────────────────────────────────
function renderTimeChart(orders) {
  const byVendor = {};
  orders.filter(o => o.status === 'done' && o.completed_at).forEach(o => {
    const hrs = (new Date(o.completed_at) - new Date(o.created_at)) / 3600000;
    if (!byVendor[o.vendor_name]) byVendor[o.vendor_name] = [];
    byVendor[o.vendor_name].push(hrs);
  });

  const labels = Object.keys(byVendor);
  const values = labels.map(v => {
    const arr = byVendor[v];
    return parseFloat((arr.reduce((s,x) => s+x, 0) / arr.length).toFixed(2));
  });

  destroyChart('time');
  const ctx = document.getElementById('chart-time').getContext('2d');

  if (labels.length === 0) {
    // Sem dados de tempo ainda
    ctx.canvas.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:0.85rem">Dados disponíveis após pedidos concluídos<br>com campo <code>completed_at</code></div>';
    return;
  }

  charts.time = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Horas em média',
        data: values,
        backgroundColor: '#c9a84cCC',
        borderColor: '#c9a84c',
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toFixed(1)} horas` } }
      }
    }
  });
}

// ── Gráfico: Status dos pedidos (rosca) ──────────────────────────────────────
function renderStatusChart(orders) {
  const todo     = orders.filter(o => o.status === 'todo').length;
  const progress = orders.filter(o => o.status === 'progress').length;
  const done     = orders.filter(o => o.status === 'done').length;

  destroyChart('status');
  const ctx = document.getElementById('chart-status').getContext('2d');
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['A Fazer', 'Em Andamento', 'Concluído'],
      datasets: [{
        data: [todo, progress, done],
        backgroundColor: ['#C0392BCC','#E67E22CC','#27AE60CC'],
        borderColor:     ['#C0392B','#E67E22','#27AE60'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8a8070', font: { size: 11, family: 'DM Sans' }, boxWidth: 12, padding: 8 }
        }
      }
    }
  });
}

// ── Gráfico: Pedidos por dia (linha) ──────────────────────────────────────
function renderTimelineChart(orders) {
  const byDay = {};
  orders.forEach(o => {
    const day = o.created_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });

  const sorted = Object.entries(byDay).sort((a,b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([d]) => {
    const [y,m,day] = d.split('-');
    return `${day}/${m}`;
  });
  const values = sorted.map(([,v]) => v);

  destroyChart('timeline');
  const ctx = document.getElementById('chart-timeline').getContext('2d');
  charts.timeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Pedidos',
        data: values,
        borderColor: '#C0392B',
        backgroundColor: 'rgba(192,57,43,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: '#C0392B',
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }]
    },
    options: {
      ...baseChartOptions(),
      plugins: {
        ...baseChartOptions().plugins,
        legend: { display: false }
      }
    }
  });
}

// ── Tabela de relatório ──────────────────────────────────────
function renderReportTable(orders) {
  const byVendor = {};

  orders.forEach(o => {
    const v = o.vendor_name;
    if (!byVendor[v]) byVendor[v] = { orders: 0, done: 0, progress: 0, todo: 0, kg: 0, cuts: {}, times: [] };
    byVendor[v].orders++;
    byVendor[v][o.status]++;
    byVendor[v].kg += parseFloat(o.quantity_kg) || 0;

    // Cortes
    try {
      JSON.parse(o.cuts_json || '[]').forEach(c => {
        byVendor[v].cuts[c.type] = (byVendor[v].cuts[c.type] || 0) + parseFloat(c.qty);
      });
    } catch {
      const k = o.cut_type?.split('(')[0].trim() || '—';
      byVendor[v].cuts[k] = (byVendor[v].cuts[k] || 0) + 1;
    }

    // Tempo
    if (o.status === 'done' && o.completed_at) {
      byVendor[v].times.push((new Date(o.completed_at) - new Date(o.created_at)) / 3600000);
    }
  });

  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = '';

  const sorted = Object.entries(byVendor).sort((a,b) => b[1].orders - a[1].orders);

  sorted.forEach(([name, d]) => {
    const favCut = Object.entries(d.cuts).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
    const avgT = d.times.length
      ? formatHours(d.times.reduce((s,x) => s+x, 0) / d.times.length)
      : '—';

    tbody.innerHTML += `
      <tr>
        <td><strong>${escHtml(name)}</strong></td>
        <td style="text-align:center"><strong>${d.orders}</strong></td>
        <td style="text-align:center"><span class="status-badge status-done">${d.done}</span></td>
        <td style="text-align:center"><span class="status-badge status-progress">${d.progress}</span></td>
        <td style="text-align:center"><span class="status-badge status-todo">${d.todo}</span></td>
        <td style="color:var(--gold);font-weight:600">${d.kg.toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</td>
        <td style="color:var(--text-muted)">${avgT}</td>
        <td style="color:var(--text-muted)">${escHtml(favCut)}</td>
      </tr>`;
  });

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Nenhum dado para o período selecionado.</td></tr>';
  }
}

// ── Exportar Excel ──────────────────────────────────────
function exportExcel() {
  const orders  = getFilteredOrders();
  const month   = document.getElementById('filter-month');
  const year    = document.getElementById('filter-year').value;
  const periodo = month.value === 'all'
    ? `Todos_${year}`
    : `${month.options[month.selectedIndex].text}_${year}`;

  const wb = XLSX.utils.book_new();

  // ── Aba 1: Pedidos detalhados ──
  const pedidosData = [
    ['#', 'Data', 'Vendedor', 'Cliente', 'Cortes', 'Total (kg)', 'Observações', 'Status', 'Tempo de Produção (h)']
  ];

  orders.forEach((o, i) => {
    let cutsStr = o.cut_type || '';
    try {
      const cuts = JSON.parse(o.cuts_json || '[]');
      if (cuts.length) cutsStr = cuts.map(c => `${c.type} (${c.qty}kg)`).join(', ');
    } catch {}

    const tempo = (o.status === 'done' && o.completed_at)
      ? ((new Date(o.completed_at) - new Date(o.created_at)) / 3600000).toFixed(2)
      : '';

    const statusLabel = { todo: 'A Fazer', progress: 'Em Andamento', done: 'Concluído' }[o.status] || o.status;

    pedidosData.push([
      i + 1,
      new Date(o.created_at).toLocaleString('pt-BR'),
      o.vendor_name,
      o.client_name,
      cutsStr,
      parseFloat(o.quantity_kg) || 0,
      o.observations || '',
      statusLabel,
      tempo
    ]);
  });

  const wsPedidos = XLSX.utils.aoa_to_sheet(pedidosData);
  wsPedidos['!cols'] = [
    {wch:5},{wch:18},{wch:18},{wch:22},{wch:40},{wch:12},{wch:28},{wch:14},{wch:20}
  ];
  XLSX.utils.book_append_sheet(wb, wsPedidos, 'Pedidos');

  // ── Aba 2: Resumo por Vendedor ──
  const byVendor = {};
  orders.forEach(o => {
    const v = o.vendor_name;
    if (!byVendor[v]) byVendor[v] = { orders: 0, done: 0, progress: 0, todo: 0, kg: 0, cuts: {}, times: [] };
    byVendor[v].orders++;
    byVendor[v][o.status]++;
    byVendor[v].kg += parseFloat(o.quantity_kg) || 0;
    try {
      JSON.parse(o.cuts_json || '[]').forEach(c => {
        byVendor[v].cuts[c.type] = (byVendor[v].cuts[c.type] || 0) + parseFloat(c.qty);
      });
    } catch {}
    if (o.status === 'done' && o.completed_at) {
      byVendor[v].times.push((new Date(o.completed_at) - new Date(o.created_at)) / 3600000);
    }
  });

  const resumoData = [
    ['Vendedor', 'Total Pedidos', 'Concluídos', 'Em Andamento', 'A Fazer', 'Total Kg', 'Tempo Médio (h)', 'Corte Favorito']
  ];
  Object.entries(byVendor).sort((a,b) => b[1].orders - a[1].orders).forEach(([name, d]) => {
    const favCut = Object.entries(d.cuts).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
    const avgT   = d.times.length
      ? (d.times.reduce((s,x) => s+x, 0) / d.times.length).toFixed(2)
      : '—';
    resumoData.push([name, d.orders, d.done, d.progress, d.todo, parseFloat(d.kg.toFixed(2)), avgT, favCut]);
  });

  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  wsResumo['!cols'] = [{wch:20},{wch:14},{wch:14},{wch:16},{wch:12},{wch:12},{wch:18},{wch:20}];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Vendedores');

  // ── Aba 3: Cortes ──
  const byCut = {};
  orders.forEach(o => {
    try {
      JSON.parse(o.cuts_json || '[]').forEach(c => {
        byCut[c.type] = (byCut[c.type] || 0) + parseFloat(c.qty);
      });
    } catch {}
  });

  const cortesData = [['Tipo de Corte', 'Total (kg)']];
  Object.entries(byCut).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    cortesData.push([k, parseFloat(v.toFixed(2))]);
  });

  const wsCortes = XLSX.utils.aoa_to_sheet(cortesData);
  wsCortes['!cols'] = [{wch:28},{wch:14}];
  XLSX.utils.book_append_sheet(wb, wsCortes, 'Cortes');

  // ── Estilos de cabeçalho ──
  [wsPedidos, wsResumo, wsCortes].forEach(ws => {
    styleHeader(ws);
  });

  XLSX.writeFile(wb, `PedidoFácil_Relatorio_${periodo}.xlsx`);
}

function styleHeader(ws) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
    if (!cell) continue;
    cell.s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '1A1A1A' } },
      alignment: { horizontal: 'center' }
    };
  }
}

// ── Utilitários ──────────────────────────────────────
function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#2e2e2e',
        titleColor: '#f0ebe0',
        bodyColor: '#8a8070',
        borderColor: '#3a3a3a',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        ticks: { color: '#8a8070', font: { family: 'DM Sans', size: 11 } },
        grid:  { color: 'rgba(255,255,255,0.04)' }
      },
      y: {
        ticks: { color: '#8a8070', font: { family: 'DM Sans', size: 11 } },
        grid:  { color: 'rgba(255,255,255,0.04)' }
      }
    }
  };
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); charts[key] = null; }
}

function formatHours(h) {
  if (h < 1)  return Math.round(h * 60) + ' min';
  if (h < 24) return h.toFixed(1).replace('.', ',') + ' h';
  return (h / 24).toFixed(1).replace('.', ',') + ' dias';
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function logout() {
  sessionStorage.removeItem('cs_user');
  window.location.href = 'login.html';
}