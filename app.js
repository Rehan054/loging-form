const K = {
  users   : 'ftp_users',
  session : 'ftp_session',
  txns    : u => 'ftp_tx_' + u,
  prefs   : u => 'ftp_prefs_' + u,
};


let user      = null;   // current username
let txns      = [];     // transactions array
let prefs     = {};     // { name, currency, dark }
let txType    = 'income';
let chartInst = null;


const load = k       => JSON.parse(localStorage.getItem(k));
const save = (k, v)  => localStorage.setItem(k, JSON.stringify(v));
const drop = k       => localStorage.removeItem(k);


function login() {
  const u = _val('loginUser');
  const p = _val('loginPass');
  _err('loginErr', '');

  if (!u || !p) return _err('loginErr', 'Please fill in all fields.');

  const users = load(K.users) || {};
  if (!users[u] || users[u].pw !== p) return _err('loginErr', 'Incorrect username or password.');

  save(K.session, u);
  _boot(u);
}

function register() {
  const name = _val('regName');
  const u    = _val('regUser');
  const p    = _val('regPass');
  _err('registerErr', '');

  if (!name || !u || !p) return _err('registerErr', 'All fields are required.');
  if (p.length < 4)      return _err('registerErr', 'Password must be at least 4 characters.');

  const users = load(K.users) || {};
  if (users[u])          return _err('registerErr', 'Username already taken.');

  users[u] = { name, pw: p };
  save(K.users, users);

  // default prefs with name
  const existing = load(K.prefs(u)) || {};
  save(K.prefs(u), { name, currency: '₹', dark: false, ...existing });

  save(K.session, u);
  _boot(u);
}

function logout() {
  drop(K.session);
  user = null; txns = []; prefs = {};
  if (chartInst) { chartInst.destroy(); chartInst = null; }
  _val('loginUser', ''); _val('loginPass', '');
  switchPage('login');
}

function _boot(u) {
  user  = u;
  txns  = load(K.txns(u))  || [];
  prefs = load(K.prefs(u)) || { name: u, currency: '₹', dark: false };

 
  _applyDark(prefs.dark);

  
  _syncPrefsUI();

 
  _show('app');
  _hide('loginPage');
  _hide('registerPage');

  // init
  showPage('dashboard');
  refresh();
}


function showPage(pg) {
 
  document.getElementById('dashPage').style.display     = pg === 'dashboard' ? '' : 'none';
  document.getElementById('settingsPage').style.display = pg === 'settings'  ? '' : 'none';

 
  document.getElementById('nav-dashboard').className = 'nav-item' + (pg === 'dashboard' ? ' active' : '');
  document.getElementById('nav-settings').className  = 'nav-item' + (pg === 'settings'  ? ' active' : '');

  // close mobile sidebar
  closeSidebar();

  return false; // prevent href jump
}

function switchPage(pg) {
  _hide('loginPage');
  _hide('registerPage');
  if (pg === 'login')    _show('loginPage');
  if (pg === 'register') _show('registerPage');
}

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const isOpen   = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('visible', isOpen);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.classList.remove('visible');
}


function saveTransaction() {
  const desc = _val('mDesc').trim();
  const amt  = parseFloat(_val('mAmt'));
  const date = _val('mDate');
  const cat  = _val('mCat');
  _err('mErr', '');

  if (!desc)         return _err('mErr', 'Description is required.');
  if (!amt || amt <= 0) return _err('mErr', 'Enter a valid amount.');
  if (!date)         return _err('mErr', 'Select a date.');
  if (!cat)          return _err('mErr', 'Choose a category.');

  txns.push({ id: Date.now(), type: txType, desc, amt, date, cat });
  save(K.txns(user), txns);
  closeModal();
  refresh();
}

function deleteTx(id) {
  txns = txns.filter(t => t.id !== id);
  save(K.txns(user), txns);
  refresh();
}


function saveProfile() {
  prefs.name = _val('sName').trim() || prefs.name;
  _savePrefs();
  _syncPrefsUI();
  toast('Profile saved');
}

function saveCurrency() {
  prefs.currency = document.getElementById('currSel').value;
  _savePrefs();
  refresh();
  toast('Currency updated');
}

function saveCurrencySettings() {
  prefs.currency = document.getElementById('sCurr').value;
  _savePrefs();
  refresh();
  _syncPrefsUI();
  toast('Currency updated');
}

function resetAll() {
  if (!confirm('Delete ALL transactions? This cannot be undone.')) return;
  txns = [];
  drop(K.txns(user));
  refresh();
  toast('All data cleared');
}

function toggleDark() {
  prefs.dark = !prefs.dark;
  _applyDark(prefs.dark);
  _savePrefs();
  if (chartInst) renderChart(); // re-render chart for color change
}

function _applyDark(on) {
  document.body.classList.toggle('dark', on);
  const t1 = document.getElementById('darkToggle');
  const t2 = document.getElementById('darkToggle2');
  if (t1) t1.checked = on;
  if (t2) t2.checked = on;
}

function _savePrefs() { save(K.prefs(user), prefs); }

function _syncPrefsUI() {
  // topbar name
  const users = load(K.users) || {};
  const dispName = prefs.name || (users[user] && users[user].name) || user;
  _setText('topbarUser', dispName);

  // settings page inputs
  const sn = document.getElementById('sName');
  if (sn) sn.value = prefs.name || '';

  const sc = document.getElementById('sCurr');
  if (sc) sc.value = prefs.currency || '₹';

  const cs = document.getElementById('currSel');
  if (cs) cs.value = prefs.currency || '₹';

  _applyDark(prefs.dark);
}


function refresh() {
  updateCards();
  renderTable();
  renderChart();
  updateSummary();
}


function updateCards() {
  const { inc, exp } = _totals();
  const sym = prefs.currency || '₹';
  const bal = inc - exp;

  _setText('statBalance', fmt(bal, sym));
  _setText('statIncome',  fmt(inc, sym));
  _setText('statExpense', fmt(exp, sym));
  _setText('statCount',   txns.length);

  document.getElementById('statBalance').className = 'stat-value' + (bal < 0 ? ' red-val' : '');
}


function renderTable() {
  const body   = document.getElementById('txBody');
  const empty  = document.getElementById('emptyMsg');
  const filter = document.getElementById('filterSelect').value;
  const search = (_val('searchInput') || '').toLowerCase();
  const sym    = prefs.currency || '₹';

  let list = [...txns].filter(t => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (search && !t.desc.toLowerCase().includes(search) && !t.cat.toLowerCase().includes(search)) return false;
    return true;
  });

  // sort newest first
  list.sort((a, b) => new Date(b.date) - new Date(a.date));

  body.innerHTML = '';

  if (list.length === 0) {
    empty.style.display = '';
    document.getElementById('txTable').style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  document.getElementById('txTable').style.display = '';

  list.forEach(t => {
    const tr   = document.createElement('tr');
    const inc  = t.type === 'income';
    const dStr = new Date(t.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    tr.innerHTML =
      '<td>' + dStr + '</td>' +
      '<td>' + _esc(t.desc) + '</td>' +
      '<td><span class="cat-chip">' + _esc(t.cat) + '</span></td>' +
      '<td class="' + (inc ? 'tx-inc' : 'tx-exp') + '">' + (inc ? '+' : '-') + fmt(t.amt, sym) + '</td>' +
      '<td><button class="btn-del" onclick="deleteTx(' + t.id + ')">Delete</button></td>';
    body.appendChild(tr);
  });
}


function renderChart() {
  const canvas = document.getElementById('chart');
  if (!canvas) return;


  const map = {};
  txns.forEach(t => {
    if (!map[t.date]) map[t.date] = { inc: 0, exp: 0 };
    if (t.type === 'income')  map[t.date].inc += t.amt;
    if (t.type === 'expense') map[t.date].exp += t.amt;
  });

  const dates  = Object.keys(map).sort();
  const labels = dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
  const incData = dates.map(d => map[d].inc);
  const expData = dates.map(d => map[d].exp);

  if (chartInst) { chartInst.destroy(); chartInst = null; }

  const dark = document.body.classList.contains('dark');
  const gridClr = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)';
  const tickClr = dark ? '#6b7280' : '#9ca3af';

  chartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incData,
          backgroundColor: 'rgba(22,163,74,.7)',
          borderRadius: 5,
          borderSkipped: false,
          barPercentage: .6,
        },
        {
          label: 'Expenses',
          data: expData,
          backgroundColor: 'rgba(220,38,38,.65)',
          borderRadius: 5,
          borderSkipped: false,
          barPercentage: .6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + (prefs.currency || '₹') + ctx.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          },
        },
      },
      scales: {
        x: { grid: { color: gridClr }, ticks: { color: tickClr, font: { size: 11 } } },
        y: {
          grid: { color: gridClr },
          ticks: {
            color: tickClr,
            font: { size: 11 },
            callback: v => (prefs.currency || '₹') + v.toLocaleString('en-IN'),
          },
        },
      },
    },
  });
}


function updateSummary() {
  const { inc, exp } = _totals();
  const bal  = inc - exp;
  const rate = inc > 0 ? Math.round((bal / inc) * 100) : 0;
  const avg  = txns.length > 0 ? (inc + exp) / txns.length : 0;
  const sym  = prefs.currency || '₹';

  
  const now = new Date();
  const mnth = txns.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  _setText('savingsRate', rate + '%');
  document.getElementById('savingsRate').className = 's-val ' + (rate >= 0 ? 'green-val' : 'red-val');
  _setText('avgTx', fmt(avg, sym));
  _setText('thisMonth', mnth + ' txn' + (mnth !== 1 ? 's' : ''));
}


function openModal() {
  _val('mDesc', '');
  _val('mAmt', '');
  _val('mDate', new Date().toISOString().split('T')[0]);
  _val('mCat', '');
  _err('mErr', '');
  setType('income');
  document.getElementById('modalBg').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalBg').style.display = 'none';
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalBg')) closeModal();
}

function setType(t) {
  txType = t;
  document.getElementById('typInc').className = 'type-btn' + (t === 'income' ? ' active' : '');
  document.getElementById('typExp').className = 'type-btn' + (t === 'expense' ? ' active' : '');
}


function toast(msg) {
  const old = document.getElementById('toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'toast';
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '24px', left: '50%',
    transform: 'translateX(-50%)',
    background: '#1a1d23', color: '#fff',
    padding: '10px 20px', borderRadius: '8px',
    fontSize: '13px', fontWeight: '500',
    boxShadow: '0 4px 16px rgba(0,0,0,.18)',
    zIndex: '999', fontFamily: 'inherit',
    animation: 'rise .2s ease',
  });
  document.body.appendChild(el);
  setTimeout(() => el && el.remove(), 2400);
}


function _totals() {
  let inc = 0, exp = 0;
  txns.forEach(t => { t.type === 'income' ? inc += t.amt : exp += t.amt; });
  return { inc, exp };
}

function fmt(n, sym) {
  return (sym || '₹') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _val(id, set) {
  const el = document.getElementById(id);
  if (!el) return '';
  if (set !== undefined) { el.value = set; return; }
  return el.value;
}

function _setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function _err(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

function _esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function _hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }


document.addEventListener('DOMContentLoaded', function() {
  const s = load(K.session);
  if (s) {
    _boot(s);
  } else {
    _show('loginPage');
    _hide('registerPage');
    _hide('app');
  }

  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
  });
});