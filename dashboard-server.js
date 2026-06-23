/**
 * NOA — Serveur dashboard local (Express)
 * Accessible sur http://[IP-BORNE]:3000 depuis n'importe quel
 * appareil sur le même réseau WiFi.
 * Protégé par mot de passe configurable.
 */

const express = require('express');
const path    = require('path');
const os      = require('os');
const { getOrders, getStats, getOrdersCsv } = require('./database');

const PORT     = 3000;
const PASSWORD = process.env.NOA_DASHBOARD_PASSWORD || 'noa2025';

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

function startDashboard() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Auth simple par session cookie ──────────────────────────────
  const sessions = new Set();
  function auth(req, res, next) {
    const token = req.headers['x-noa-token'] || req.query.token;
    if (sessions.has(token)) return next();
    res.status(401).json({ error: 'Non autorisé' });
  }

  app.post('/api/login', (req, res) => {
    if (req.body.password === PASSWORD) {
      const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessions.add(token);
      res.json({ ok: true, token });
    } else {
      res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
    }
  });

  // ── API données ──────────────────────────────────────────────────
  app.get('/api/stats',  auth, (_req, res) => res.json(getStats()));

  app.get('/api/orders', auth, (req, res) => {
    const { search = '', from = '', to = '', page = 1 } = req.query;
    const limit = 50, offset = (page - 1) * limit;
    res.json(getOrders({ limit, offset, search, from, to }));
  });

  app.get('/api/export', auth, (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="noa-commandes-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('﻿' + getOrdersCsv()); // BOM pour Excel
  });

  // ── Dashboard HTML ───────────────────────────────────────────────
  app.get('/', (_req, res) => res.send(getDashboardHTML()));

  app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log(`[NOA Dashboard] http://${ip}:${PORT}  |  mdp: ${PASSWORD}`);
  });

  return { ip: getLocalIP(), port: PORT };
}

// ── HTML du dashboard (inline, zéro dépendance front) ───────────────
function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>N·O·A — Dashboard</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--navy:#0d1f3c;--gold:#b8933a;--bg:#f5f3ef;--white:#fff;--green:#2e9e5b;--muted:#6b7897;--border:#e4dfd6}
  body{font-family:'Segoe UI',Arial,sans-serif;background:var(--bg);color:var(--navy);min-height:100vh}

  /* Login */
  #login{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:1.5rem}
  .login-box{background:var(--white);border-radius:20px;padding:2.5rem 2rem;width:340px;box-shadow:0 8px 40px rgba(13,31,60,.12);display:flex;flex-direction:column;gap:1rem;align-items:center}
  .login-logo{font-size:1.8rem;font-weight:700;letter-spacing:.2em;color:var(--navy)}
  .login-sub{font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
  .login-box input{width:100%;padding:.85rem 1rem;border:1.5px solid var(--border);border-radius:10px;font-size:.95rem;outline:none;font-family:inherit}
  .login-box input:focus{border-color:var(--gold)}
  .btn-login{width:100%;padding:.9rem;background:var(--navy);color:var(--white);border:none;border-radius:10px;font-size:1rem;font-weight:600;cursor:pointer;font-family:inherit}
  .btn-login:hover{background:#1a3057}
  .login-err{color:#e74c3c;font-size:.82rem;display:none}

  /* App */
  #app{display:none}
  header{background:var(--navy);color:var(--white);padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between}
  .h-logo{font-size:1.1rem;font-weight:700;letter-spacing:.15em}
  .h-sub{font-size:.6rem;letter-spacing:.25em;text-transform:uppercase;color:var(--gold);margin-top:.1rem}
  .btn-export{background:var(--gold);color:var(--white);border:none;border-radius:8px;padding:.5rem 1.2rem;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit}

  main{padding:1.5rem 2rem;display:flex;flex-direction:column;gap:1.5rem;max-width:1300px;margin:0 auto}

  /* Stats cards */
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem}
  .stat{background:var(--white);border-radius:16px;padding:1.25rem 1.5rem;box-shadow:0 2px 12px rgba(13,31,60,.06)}
  .stat-val{font-size:1.9rem;font-weight:700;color:var(--navy);font-family:'Georgia',serif}
  .stat-label{font-size:.72rem;color:var(--muted);margin-top:.2rem;text-transform:uppercase;letter-spacing:.05em}
  .stat.highlight .stat-val{color:var(--gold)}
  .stat.green .stat-val{color:var(--green)}

  /* Filtres */
  .filters{display:flex;gap:.75rem;flex-wrap:wrap;align-items:flex-end}
  .filters input{padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:8px;font-size:.85rem;font-family:inherit;outline:none}
  .filters input:focus{border-color:var(--gold)}
  .btn-filter{padding:.6rem 1.2rem;background:var(--navy);color:var(--white);border:none;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit}

  /* Table */
  .table-wrap{background:var(--white);border-radius:16px;box-shadow:0 2px 12px rgba(13,31,60,.06);overflow:auto}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  thead th{background:var(--navy);color:var(--white);padding:.85rem 1rem;text-align:left;font-weight:600;font-size:.78rem;letter-spacing:.04em;white-space:nowrap}
  tbody tr{border-bottom:1px solid var(--border);transition:background .1s}
  tbody tr:hover{background:#fafaf7}
  tbody td{padding:.8rem 1rem;color:var(--navy)}
  .badge{display:inline-block;padding:.2rem .6rem;border-radius:50px;font-size:.7rem;font-weight:700}
  .badge.wave{background:#e0f5ff;color:#0077aa}
  .badge.orange{background:#fff3e0;color:#e65c00}
  .badge.pd{background:#eefaf3;color:var(--green)}
  .montant{font-weight:700;color:var(--navy)}
  .empty{padding:3rem;text-align:center;color:var(--muted)}

  /* Pagination */
  .pagination{display:flex;gap:.5rem;justify-content:center;align-items:center}
  .pagination button{padding:.4rem .9rem;border:1.5px solid var(--border);background:var(--white);border-radius:8px;cursor:pointer;font-size:.82rem;font-family:inherit}
  .pagination button.active{background:var(--navy);color:var(--white);border-color:var(--navy)}
  .pagination button:disabled{opacity:.4;cursor:default}
</style>
</head>
<body>

<!-- Login -->
<div id="login">
  <div class="login-box">
    <div class="login-logo">N · O · A</div>
    <div class="login-sub">Dashboard Admin</div>
    <input type="password" id="pwdInput" placeholder="Mot de passe" autocomplete="current-password">
    <button class="btn-login" onclick="doLogin()">Accéder au dashboard</button>
    <span class="login-err" id="loginErr">Mot de passe incorrect</span>
  </div>
</div>

<!-- Dashboard -->
<div id="app">
  <header>
    <div>
      <div class="h-logo">N · O · A</div>
      <div class="h-sub">Nouvelle Optique Africaine — Commandes</div>
    </div>
    <button class="btn-export" onclick="exportCsv()">Exporter CSV</button>
  </header>

  <main>
    <div class="stats" id="statsGrid"></div>

    <div class="filters">
      <input type="text"  id="fSearch" placeholder="Nom, téléphone, N° commande…" style="flex:1;min-width:200px">
      <input type="date"  id="fFrom"   title="Du">
      <input type="date"  id="fTo"     title="Au">
      <button class="btn-filter" onclick="load(1)">Filtrer</button>
      <button class="btn-filter" style="background:var(--muted)" onclick="resetFilters()">Réinitialiser</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>N° Commande</th><th>Date</th><th>Client</th><th>Téléphone</th>
            <th>Monture</th><th>Extras</th><th>Paiement</th><th>Montant</th><th>DI (mm)</th>
          </tr>
        </thead>
        <tbody id="ordersTbody"></tbody>
      </table>
      <div class="empty" id="emptyMsg" style="display:none">Aucune commande trouvée.</div>
    </div>

    <div class="pagination" id="pagination"></div>
  </main>
</div>

<script>
let TOKEN = '';
let currentPage = 1;

function fmtFcfa(n){ return Number(n).toLocaleString('fr-FR') + ' FCFA'; }
function fmtDate(d){ return d ? new Date(d).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'; }

async function doLogin(){
  const pwd = document.getElementById('pwdInput').value;
  const r = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pwd})});
  const d = await r.json();
  if(d.ok){
    TOKEN = d.token;
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    loadStats(); load(1);
  } else {
    document.getElementById('loginErr').style.display = 'block';
  }
}
document.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

async function api(url){
  const r = await fetch(url,{headers:{'x-noa-token':TOKEN}});
  if(r.status===401){ location.reload(); return null; }
  return r.json();
}

async function loadStats(){
  const s = await api('/api/stats'); if(!s) return;
  document.getElementById('statsGrid').innerHTML = \`
    <div class="stat highlight"><div class="stat-val">\${s.today}</div><div class="stat-label">Commandes aujourd'hui</div></div>
    <div class="stat"><div class="stat-val">\${s.total}</div><div class="stat-label">Total commandes</div></div>
    <div class="stat green"><div class="stat-val">\${fmtFcfa(s.revenueToday)}</div><div class="stat-label">CA aujourd'hui</div></div>
    <div class="stat"><div class="stat-val">\${fmtFcfa(s.revenue)}</div><div class="stat-label">CA total</div></div>
    <div class="stat"><div class="stat-val">\${s.clients}</div><div class="stat-label">Clients uniques</div></div>
    <div class="stat"><div class="stat-val">\${s.topMonture?.monture || '—'}</div><div class="stat-label">Monture la + vendue</div></div>
  \`;
}

async function load(page){
  currentPage = page;
  const search = document.getElementById('fSearch').value;
  const from   = document.getElementById('fFrom').value;
  const to     = document.getElementById('fTo').value;
  const data = await api(\`/api/orders?page=\${page}&search=\${encodeURIComponent(search)}&from=\${from}&to=\${to}\`);
  if(!data) return;

  const tbody = document.getElementById('ordersTbody');
  const empty = document.getElementById('emptyMsg');
  if(!data.length){ tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = data.map(r => {
    const extras = (() => { try { return JSON.parse(r.extras||'[]').join(', ') || '—'; } catch{ return '—'; } })();
    const payCls = r.paiement==='Wave' ? 'wave' : 'orange';
    const pd = r.pd_mm ? \`<span class="badge pd">\${Number(r.pd_mm).toFixed(1)} mm</span>\` : '—';
    return \`<tr>
      <td style="font-weight:600;font-size:.78rem">\${r.id}</td>
      <td style="white-space:nowrap;color:var(--muted);font-size:.78rem">\${fmtDate(r.date)}</td>
      <td>\${r.nom}</td>
      <td style="color:var(--muted)">\${r.tel}</td>
      <td>\${r.monture||'—'}</td>
      <td style="font-size:.78rem;color:var(--muted)">\${extras}</td>
      <td><span class="badge \${payCls}">\${r.paiement}</span></td>
      <td class="montant">\${fmtFcfa(r.montant)}</td>
      <td>\${pd}</td>
    </tr>\`;
  }).join('');

  // Pagination simple
  const pg = document.getElementById('pagination');
  pg.innerHTML = \`
    <button onclick="load(\${page-1})" \${page<=1?'disabled':''}>← Préc.</button>
    <span style="font-size:.85rem;color:var(--muted)">Page \${page}</span>
    <button onclick="load(\${page+1})" \${data.length<50?'disabled':''}>Suiv. →</button>
  \`;
}

function resetFilters(){
  document.getElementById('fSearch').value='';
  document.getElementById('fFrom').value='';
  document.getElementById('fTo').value='';
  load(1);
}

function exportCsv(){
  window.open(\`/api/export?token=\${TOKEN}\`,'_blank');
}
</script>
</body>
</html>`;
}

module.exports = { startDashboard };
