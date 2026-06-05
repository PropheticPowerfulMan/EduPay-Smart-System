const http = require('http');
const url = require('url');

// Mock data aligned with the shared KCS demo directory.
function buildUnifiedDemoParents() {
  const parentNames = [
    ['Kabongo', 'Rachel'], ['Mbuyi', 'Mireille'], ['Lukusa', 'Cedric'], ['Ilunga', 'Nadine'], ['Tshibangu', 'Patrick'],
    ['Mavungu', 'Aline'], ['Kalala', 'Samuel'], ['Moke', 'Sarah'], ['Banza', 'Grace'], ['Kanku', 'David'],
    ['Mukendi', 'Chantal'], ['Tshomba', 'Daniel'], ['Mbala', 'Esther'], ['Kasongo', 'Joel'], ['Ngoy', 'Carine'],
    ['Kitenge', 'Fabrice'], ['Mulumba', 'Ruth'], ['Nkulu', 'Benedicte'], ['Beya', 'Jonathan'], ['Lunda', 'Prisca'],
    ['Tshimanga', 'Arnaud'], ['Kayembe', 'Rose'], ['Mutombo', 'Lionel'], ['Kabasele', 'Diane'], ['Nsimba', 'Marc'],
    ['Mpoyi', 'Sandrine'], ['Lwamba', 'Eric'], ['Makiese', 'Gloria'], ['Kalonji', 'Herve']
  ];
  const studentNames = ['Elise', 'David', 'Amani', 'Noah', 'Naomi', 'Ethan', 'Sarah', 'Joshua', 'Deborah', 'Samuel', 'Rebecca', 'Nathan', 'Esther', 'Daniel', 'Merveille', 'Joanna', 'Grace', 'Aaron', 'Rachelle', 'Jonathan', 'Prisca', 'Emmanuel', 'Christelle', 'Benjamin', 'Ruth', 'Joel', 'Benedicte', 'Isaac', 'Naomie', 'Joseph', 'Judith', 'Caleb', 'Hadassa', 'Ezekiel', 'Miriam', 'Levi', 'Rachel', 'Elie', 'Abigail', 'Matthieu', 'Anne', 'Simeon', 'Tabitha', 'Timothee'];
  let studentIndex = 0;
  return parentNames.map((entry, parentIndex) => {
    const studentCount = parentIndex < 15 ? 2 : 1;
    const students = Array.from({ length: studentCount }, () => `${studentNames[studentIndex++]} ${entry[0]}`);
    const annualFee = students.length * (1800 + ((parentIndex % 6) * 120));
    return {
      id: `PAR-KCS-${String(parentIndex + 1).padStart(3, '0')}`,
      name: `${entry[1]} ${entry[0]}`,
      phone: `+243 812 45${String(parentIndex + 1).padStart(4, '0')}`,
      email: `${entry[1].toLowerCase()}.${entry[0].toLowerCase()}@kcs.local`,
      students,
      annualFee,
      paid: parentIndex < 12 ? Math.round(annualFee * (0.35 + (parentIndex % 3) * 0.12)) : 0
    };
  });
}

let parents = buildUnifiedDemoParents();

let payments = parents.slice(0, 12).map((parent, index) => {
  const completed = index % 4 !== 3;
  return {
    id: `p${index + 1}`,
    txNumber: `TXN-202604${String(index + 10).padStart(2, '0')}-${10001 + index}`,
    parent: parent.name,
    student: parent.students[0],
    amount: completed ? parent.paid : 0,
    reason: 'Frais scolaires',
    date: `2026-04-${String(index + 10).padStart(2, '0')}`,
    status: completed ? 'COMPLETED' : 'PENDING'
  };
});

let currentUser = null;

function formatMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function getParentFinancials(parent, paymentRows = payments) {
  const expected = Number(parent.annualFee || 0);
  const paid = paymentRows
    .filter((payment) => payment.parent === parent.name && payment.status === 'COMPLETED')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return { expected, paid, debt: Math.max(expected - paid, 0) };
}

function computeEduPayMetrics(parentRows = parents, paymentRows = payments) {
  const parentMetrics = parentRows.map((parent) => ({ parent, ...getParentFinancials(parent, paymentRows) }));
  const totalExpected = parentMetrics.reduce((sum, row) => sum + row.expected, 0);
  const totalRevenue = paymentRows
    .filter((payment) => payment.status === 'COMPLETED')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = paymentRows
    .filter((payment) => payment.status === 'COMPLETED' && String(payment.date || '').slice(0, 7) === currentMonth)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const completedPayments = paymentRows.filter((payment) => payment.status === 'COMPLETED').length;
  const successRate = paymentRows.length ? Math.round((completedPayments / paymentRows.length) * 100) : 0;
  const debt = Math.max(totalExpected - totalRevenue, 0);
  const unpaidParents = parentMetrics.filter((row) => row.debt > 0);
  return { totalRevenue, monthlyRevenue, completedPayments, successRate, debt, unpaidParents };
}

const initialMetrics = computeEduPayMetrics();

const htmlPage = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EduPay Smart System</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f9ff; color: #0f172a; }
    
    .brand { background: linear-gradient(140deg, #0b2e59, #1f4f8f); color: white; }
    
    header.brand { padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(11,46,89,0.15); }
    header h1 { font-size: 1.5rem; font-weight: 700; }
    header .subtitle { font-size: 0.85rem; opacity: 0.9; }
    header .user-info { text-align: right; }
    header .logout-btn { margin-top: 0.5rem; padding: 0.4rem 0.8rem; background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    header .logout-btn:hover { background: rgba(255,255,255,0.3); }
    
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card { background: white; padding: 1.5rem; border-radius: 1rem; box-shadow: 0 4px 12px rgba(11,46,89,0.1); }
    .card h3 { color: #0b2e59; font-size: 0.9rem; margin-bottom: 0.5rem; }
    .card .value { font-size: 2rem; font-weight: 700; color: #1f4f8f; }
    .card.ok { border-left: 4px solid #22c55e; }
    .card.warn { border-left: 4px solid #f59e0b; }
    .card.danger { border-left: 4px solid #ef4444; }
    
    .sidebar { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .nav-btn { padding: 0.75rem 1.5rem; border: none; border-radius: 0.75rem; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: all 0.2s; }
    .nav-btn.active { background: #0b2e59; color: white; }
    .nav-btn { background: #e2e8f0; color: #0f172a; }
    .nav-btn:hover { background: #cbd5e1; }
    
    .section { display: none; }
    .section.active { display: block; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    table th { background: #f1f5f9; padding: 0.75rem; text-align: left; font-weight: 600; color: #0f172a; border-bottom: 2px solid #0b2e59; }
    table td { padding: 0.75rem; border-bottom: 1px solid #e2e8f0; }
    table tr:hover { background: #f9fafb; }
    
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.4rem; font-weight: 600; color: #0b2e59; }
    .form-group input, .form-group select { width: 100%; padding: 0.6rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.95rem; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #0b2e59; background: #f0f7ff; }
    
    .btn { padding: 0.7rem 1.5rem; border: none; border-radius: 0.75rem; cursor: pointer; font-weight: 600; transition: all 0.2s; }
    .btn-primary { background: #0b2e59; color: white; }
    .btn-primary:hover { background: #1f4f8f; }
    .btn-success { background: #22c55e; color: white; }
    
    .status { display: inline-block; padding: 0.3rem 0.6rem; border-radius: 0.4rem; font-size: 0.8rem; font-weight: 600; }
    .status.completed { background: #dcfce7; color: #166534; }
    .status.pending { background: #fef3c7; color: #92400e; }
    .status.failed { background: #fee2e2; color: #991b1b; }
    
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .login-card { background: white; padding: 2rem; border-radius: 1.5rem; box-shadow: 0 10px 30px rgba(11,46,89,0.15); width: 100%; max-width: 400px; }
    .login-card h1 { color: #0b2e59; margin-bottom: 1.5rem; font-size: 1.8rem; }
    .success-msg { background: #dcfce7; color: #166534; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>

<header class="brand" id="header" style="display:none;">
  <div>
    <h1>ðŸŽ“ EduPay Smart System</h1>
    <div class="subtitle">Plateforme de paiement scolaire intelligente</div>
  </div>
  <div class="user-info">
    <div id="userName">Utilisateur</div>
    <button class="logout-btn" onclick="logout()">DÃ©connexion</button>
  </div>
</header>

<!-- LOGIN -->
<div id="loginSection" class="login-container">
  <div class="login-card">
    <h1>Connexion</h1>
    <p style="margin-bottom:1.5rem; color:#666;">Plateforme de gestion scolaire</p>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="loginEmail" autocomplete="username" />
    </div>
    <div class="form-group">
      <label>Mot de passe</label>
      <input type="password" id="loginPass" autocomplete="current-password" />
    </div>
    <button class="btn btn-primary" style="width:100%;" onclick="login()">Se connecter</button>
  </div>
</div>

<!-- MAIN APP -->
<div id="appSection" style="display:none;">

<div class="container">
  <div class="sidebar">
    <button class="nav-btn active" onclick="showSection('dashboard')">ðŸ“Š Dashboard</button>
    <button class="nav-btn" onclick="showSection('payments')">ðŸ’³ Paiements</button>
    <button class="nav-btn" onclick="showSection('parents')">ðŸ‘¥ Suivi Parents</button>
    <button class="nav-btn" onclick="showSection('ai')">ðŸ¤– Assistant IA</button>
  </div>

  <!-- Dashboard -->
  <div id="dashboard" class="section active">
    <h2 style="margin-bottom:1.5rem; color:#0b2e59;">Dashboard</h2>
    <div class="grid">
      <div class="card ok">
        <h3>Revenu Total</h3>
        <div class="value" id="kpiTotalRevenue">${formatMoney(initialMetrics.totalRevenue)} FC</div>
      </div>
      <div class="card ok">
        <h3>Revenu Mensuel</h3>
        <div class="value" id="kpiMonthlyRevenue">${formatMoney(initialMetrics.monthlyRevenue)} FC</div>
      </div>
      <div class="card warn">
        <h3>Taux de SuccÃ¨s</h3>
        <div class="value" id="kpiSuccessRate">${initialMetrics.successRate}%</div>
      </div>
      <div class="card danger">
        <h3>Dette en Cours</h3>
        <div class="value" id="kpiDebt">${formatMoney(initialMetrics.debt)} FC</div>
      </div>
    </div>
    
    <h3 style="margin-top:2rem; color:#0b2e59;">Paiements RÃ©cents</h3>
    <table>
      <thead>
        <tr>
          <th>Transaction</th>
          <th>Parent</th>
          <th>Montant</th>
          <th>Date</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map(p => `
        <tr>
          <td>${p.txNumber}</td>
          <td>${p.parent}</td>
          <td>${p.amount.toLocaleString('fr-FR')} FC</td>
          <td>${p.date}</td>
          <td><span class="status ${p.status.toLowerCase()}">${p.status === 'COMPLETED' ? 'ComplÃ©tÃ©' : 'En attente'}</span></td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Payments -->
  <div id="payments" class="section">
    <h2 style="margin-bottom:1.5rem; color:#0b2e59;">Enregistrer un Paiement</h2>
    <div class="card">
      <div class="form-group">
        <label>Parent</label>
        <select id="paymentParent">
          <option value="">-- SÃ©lectionner --</option>
          ${parents.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Motif</label>
        <input type="text" id="paymentReason" placeholder="ScolaritÃ© mensuelle" />
      </div>
      <div class="form-group">
        <label>Montant (FC)</label>
        <input type="number" id="paymentAmount" placeholder="25000" />
      </div>
      <div class="form-group">
        <label>MÃ©thode</label>
        <select id="paymentMethod">
          <option value="CASH">Cash</option>
          <option value="AIRTEL">Airtel Money</option>
          <option value="MPESA">M-Pesa</option>
          <option value="ORANGE">Orange Money</option>
        </select>
      </div>
      <button class="btn btn-success" onclick="addPayment()">âœ“ Enregistrer Paiement</button>
    </div>
  </div>

  <!-- Parents -->
  <div id="parents" class="section">
    <h2 style="margin-bottom:1.5rem; color:#0b2e59;">Suivi des Parents</h2>
    ${parents.map(p => {
      const debt = p.annualFee - p.paid;
      return `
      <div class="card" style="margin-bottom:1.5rem;">
        <h3 style="font-size:1.1rem; margin-bottom:0.5rem;">${p.name}</h3>
        <p style="color:#666; font-size:0.9rem; margin-bottom:0.8rem;">
          ðŸ“ž ${p.phone} | ðŸ“§ ${p.email}
        </p>
        <table style="font-size:0.9rem;">
          <tr>
            <td><strong>Frais annuels:</strong></td>
            <td>${p.annualFee.toLocaleString('fr-FR')} FC</td>
          </tr>
          <tr>
            <td><strong>PayÃ©:</strong></td>
            <td style="color:#22c55e;">${p.paid.toLocaleString('fr-FR')} FC</td>
          </tr>
          <tr>
            <td><strong>Restant:</strong></td>
            <td style="color:#ef4444;">${debt.toLocaleString('fr-FR')} FC</td>
          </tr>
        </table>
        <p style="margin-top:0.8rem; font-size:0.85rem; color:#666;">
          <strong>Enfants:</strong> ${p.students.join(', ')}
        </p>
      </div>
      `;
    }).join('')}
  </div>

  <!-- AI Assistant -->
  <div id="ai" class="section">
    <h2 style="margin-bottom:1.5rem; color:#0b2e59;">Assistant IA</h2>
    <div class="card">
      <p style="margin-bottom:1rem; color:#666;">Posez une question sur vos donnÃ©es scolaires en langage naturel.</p>
      <div class="form-group">
        <label>Votre Question</label>
        <textarea id="aiQuery" style="min-height:100px; padding:0.75rem; border:1px solid #cbd5e1; border-radius:0.5rem; font-family:inherit;" placeholder="Ex: Quels parents n'ont pas payÃ© ce mois? Quel est le revenu total par classe? Classe avec la plus forte dette?"></textarea>
      </div>
      <button class="btn btn-primary" onclick="askAI()">Obtenir la RÃ©ponse</button>
      
      <div id="aiResponse" style="margin-top:1.5rem; display:none;">
        <h3 style="color:#0b2e59; margin-bottom:0.8rem;">RÃ©ponse IA</h3>
        <div class="card" style="background:#f9fafb; border-left:4px solid #0b2e59;">
          <p id="aiAnswer" style="margin-bottom:1rem;"></p>
          <h4 style="color:#0b2e59; margin-bottom:0.5rem;">Suggestions</h4>
          <ul id="aiSuggestions" style="margin-left:1.5rem;"></ul>
        </div>
      </div>
    </div>
  </div>
</div>

</div>

<script>
let loggedIn = false;
let clientPayments = ${JSON.stringify(payments)};
let clientParents = ${JSON.stringify(parents)};

function formatClientMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function computeClientMetrics() {
  const parentMetrics = clientParents.map((parent) => {
    const paid = clientPayments
      .filter((payment) => payment.parent === parent.name && payment.status === 'COMPLETED')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const expected = Number(parent.annualFee || 0);
    return { parent, expected, paid, debt: Math.max(expected - paid, 0) };
  });
  const totalRevenue = clientPayments
    .filter((payment) => payment.status === 'COMPLETED')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyRevenue = clientPayments
    .filter((payment) => payment.status === 'COMPLETED' && String(payment.date || '').slice(0, 7) === currentMonth)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const completedPayments = clientPayments.filter((payment) => payment.status === 'COMPLETED').length;
  const successRate = clientPayments.length ? Math.round((completedPayments / clientPayments.length) * 100) : 0;
  const debt = parentMetrics.reduce((sum, row) => sum + row.debt, 0);
  const unpaidParents = parentMetrics.filter((row) => row.debt > 0);
  const classDebts = new Map();
  for (const row of parentMetrics) {
    for (const student of row.parent.students) {
      const className = student.className || 'Non assignee';
      const current = classDebts.get(className) || { className, debt: 0 };
      current.debt += row.parent.students.length ? row.debt / row.parent.students.length : 0;
      classDebts.set(className, current);
    }
  }
  const highestDebtClass = Array.from(classDebts.values()).sort((a, b) => b.debt - a.debt)[0] || null;
  return { totalRevenue, monthlyRevenue, completedPayments, successRate, debt, unpaidParents, highestDebtClass };
}

function refreshClientMetrics() {
  const metrics = computeClientMetrics();
  document.getElementById('kpiTotalRevenue').textContent = formatClientMoney(metrics.totalRevenue) + ' FC';
  document.getElementById('kpiMonthlyRevenue').textContent = formatClientMoney(metrics.monthlyRevenue) + ' FC';
  document.getElementById('kpiSuccessRate').textContent = metrics.successRate + '%';
  document.getElementById('kpiDebt').textContent = formatClientMoney(metrics.debt) + ' FC';
}

function login() {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPass').value;
  
  if (email === 'admin@school.com' && pass === 'password123') {
    loggedIn = true;
    currentUser = { email, name: 'Admin User' };
    
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('appSection').style.display = 'block';
    document.getElementById('header').style.display = 'flex';
    document.getElementById('userName').textContent = 'Bienvenue, ' + currentUser.name;
  } else {
    alert('Identifiants invalides');
  }
}

function logout() {
  loggedIn = false;
  document.getElementById('appSection').style.display = 'none';
  document.getElementById('header').style.display = 'none';
  document.getElementById('loginSection').style.display = 'flex';
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

function addPayment() {
  const parentId = document.getElementById('paymentParent').value;
  const reason = document.getElementById('paymentReason').value;
  const amount = parseInt(document.getElementById('paymentAmount').value);
  const method = document.getElementById('paymentMethod').value;
  
  if (!parentId || !reason || !amount) {
    alert('Remplissez tous les champs');
    return;
  }
  
  const parent = clientParents.find(p => p.id === parentId);
  const payment = {
    id: 'p' + Date.now(),
    txNumber: 'TX-' + Date.now(),
    parent: parent.name,
    student: parent.students[0],
    amount,
    reason,
    date: new Date().toISOString().split('T')[0],
    status: 'COMPLETED'
  };
  
  clientPayments.unshift(payment);
  parent.paid += amount;
  refreshClientMetrics();
  
  alert('âœ“ Paiement enregistrÃ© avec succÃ¨s!');
  document.getElementById('paymentParent').value = '';
  document.getElementById('paymentReason').value = '';
  document.getElementById('paymentAmount').value = '';
}

function askAI() {
  const query = document.getElementById('aiQuery').value.toLowerCase();
  const metrics = computeClientMetrics();
  let answer = '';
  let suggestions = [];
  
  if (query.includes('pay') || query.includes('not paid')) {
    answer = metrics.unpaidParents.length + ' parent(s) ont encore un solde a regler ce mois-ci. Solde total: ' + formatClientMoney(metrics.debt) + ' FC.';
    suggestions = ['Relancer les parents avec solde restant', 'Verifier les paiements en attente avant escalation'];
  } else if (query.includes('revenu') || query.includes('revenue')) {
    answer = 'Le revenu total calcule depuis EduPay est ' + formatClientMoney(metrics.totalRevenue) + ' FC. Paiements completes: ' + metrics.completedPayments + '/' + clientPayments.length + '.';
    suggestions = ['Comparer avec le trimestre dernier', 'Analyser par classe'];
  } else if (query.includes('dette') || query.includes('debt') || query.includes('classe')) {
    answer = metrics.highestDebtClass
      ? 'La classe avec la plus forte dette est ' + metrics.highestDebtClass.className + ' avec ' + formatClientMoney(Math.round(metrics.highestDebtClass.debt)) + ' FC.'
      : 'Aucune dette par classe dans les donnees EduPay chargees.';
    suggestions = ['Contacter les parents concernes', 'Proposer un plan de paiement echelonne'];
  } else {
    answer = 'RequÃªte comprise. Consultez le dashboard pour les analyses dÃ©taillÃ©es.';
    suggestions = ['Essayer une autre question', 'Voir les statistiques complÃ¨tes'];
  }
  
  document.getElementById('aiAnswer').textContent = answer;
  document.getElementById('aiSuggestions').innerHTML = suggestions.map(s => '<li>' + s + '</li>').join('');
  document.getElementById('aiResponse').style.display = 'block';
}
</script>

</body>
</html>
`;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // API routes
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.email === 'admin@school.com' && data.password === 'password123') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token: 'mock-jwt', role: 'ADMIN', fullName: 'Admin User' }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid credentials' }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Bad request' }));
      }
    });
  }
  
  // Serve HTML
  else if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlPage);
  }
  
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not found' }));
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log('âœ“ EduPay Server running on http://localhost:' + PORT);
  console.log('âœ“ Login: admin@school.com / password123');
});

