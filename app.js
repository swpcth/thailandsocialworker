const CHART_COLORS = ['#1e3a5f', '#a4231f', '#b8862e', '#1f7a4d', '#5a6472', '#2a4d78', '#c0392b', '#8a6d3b'];

function statusBadge(status, kind) {
  if (kind === 'membership') {
    if (status === 'active') return '<span class="badge badge-green">สมาชิกภาพปกติ</span>';
    return '<span class="badge badge-gray">ไม่เป็นสมาชิก</span>';
  }
  if (kind === 'license') {
    if (status === 'active') return '<span class="badge badge-green">ใบอนุญาตปกติ</span>';
    if (status === 'expired') return '<span class="badge badge-amber">ใบอนุญาตหมดอายุ</span>';
    if (status === 'suspended') return '<span class="badge badge-red">ถูกพักใช้</span>';
    if (status === 'revoked') return '<span class="badge badge-red">ถูกเพิกถอน</span>';
    return '<span class="badge badge-gray">ไม่มีใบอนุญาต</span>';
  }
  return '';
}

function renderResults(results) {
  const wrap = document.getElementById('searchResultsWrap');
  const dash = document.getElementById('dashboardWrap');
  const list = document.getElementById('searchResults');
  const count = document.getElementById('searchResultCount');

  if (!results.length) {
    wrap.style.display = '';
    dash.style.display = 'none';
    count.textContent = 'ไม่พบข้อมูลที่ตรงกับคำค้นหา';
    list.innerHTML = `<div class="empty-state card"><div class="icon">🔍</div><div>ลองค้นหาด้วยชื่อ-นามสกุลเต็ม หรือเลขที่ใบอนุญาต/สมาชิก</div></div>`;
    return;
  }

  wrap.style.display = '';
  dash.style.display = 'none';
  count.textContent = `พบ ${results.length} รายการ`;
  list.innerHTML = results.map(p => `
    <div class="result-card">
      <div>
        <div class="result-name">${escapeHtml(p.Prefix || '')}${escapeHtml(p.FirstName)} ${escapeHtml(p.LastName)}</div>
        <div class="result-meta">${escapeHtml(p.PositionType || '-')} · ${escapeHtml(p.AgencyName || '-')} · ${escapeHtml(p.Province || '-')}</div>
        <div class="result-meta">เลขที่สมาชิก: ${escapeHtml(p.MembershipNumber || '-')} · เลขที่ใบอนุญาต: ${escapeHtml(p.LicenseNumber || '-')}${p.LicenseExpireDate ? ' (หมดอายุ ' + fmtDate(p.LicenseExpireDate) + ')' : ''}</div>
        ${p.Specializations ? `<div class="result-meta">ความเชี่ยวชาญ: ${escapeHtml(p.Specializations)}</div>` : ''}
      </div>
      <div class="result-badges">
        ${statusBadge(p.MembershipStatus, 'membership')}
        ${statusBadge(p.LicenseStatus, 'license')}
      </div>
    </div>
  `).join('');
}

async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) {
    document.getElementById('searchResultsWrap').style.display = 'none';
    document.getElementById('dashboardWrap').style.display = '';
    return;
  }
  try {
    const { results } = await Api.search(q);
    renderResults(results);
  } catch (e) {
    toast('ค้นหาไม่สำเร็จ: ' + e.message, 'error');
  }
}

document.getElementById('searchBtn').addEventListener('click', doSearch);
document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

// โหลดไลบรารี Chart.js อีกครั้งแบบไดนามิก (เผื่อ <script> ใน head โหลดไม่ทันหรือถูกบล็อกโดยเครือข่าย/ตัวบล็อกโฆษณา)
// ลองสลับไป CDN สำรอง (jsDelivr) ถ้า cdnjs ใช้งานไม่ได้ กันปัญหาเครือข่ายบล็อกบาง CDN
function ensureChartLoaded(timeoutMs = 6000) {
  if (window.Chart) return Promise.resolve(true);
  const sources = [
    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
  ];
  function tryLoad(i) {
    if (window.Chart) return Promise.resolve(true);
    if (i >= sources.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = sources[i];
      const timer = setTimeout(() => resolve(false), timeoutMs);
      script.onload = () => { clearTimeout(timer); resolve(true); };
      script.onerror = () => { clearTimeout(timer); resolve(false); };
      document.head.appendChild(script);
    }).then(ok => (ok && window.Chart) ? true : tryLoad(i + 1));
  }
  return tryLoad(0);
}

function renderPie(ctx, labels, data) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS }] },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { family: 'Sarabun' } } } } }
  });
}

function renderBar(ctx, labels, data) {
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: '#1e3a5f' }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { font: { family: 'Sarabun' } } }, y: { beginAtZero: true } }
    }
  });
}

function showChartFallback(canvasEl, message) {
  const card = canvasEl.closest('.chart-card') || canvasEl.parentElement;
  const note = document.createElement('p');
  note.className = 'text-sm text-soft';
  note.textContent = message;
  canvasEl.replaceWith(note);
}

async function renderAllCharts(stats) {
  const chartOk = await ensureChartLoaded();
  const chartDefs = [
    ['chartMembership', () => renderPie(document.getElementById('chartMembership'),
      ['สมาชิกภาพ + ใบอนุญาต', 'เป็นสมาชิกภาพอย่างเดียว', 'ไม่เป็นทั้งสองอย่าง'],
      [stats.membershipBreakdown.bothMemberAndLicense, stats.membershipBreakdown.memberOnly, stats.membershipBreakdown.neither])],
    ['chartPosition', () => renderPie(document.getElementById('chartPosition'), Object.keys(stats.byPosition), Object.values(stats.byPosition))],
    ['chartAgency', () => renderPie(document.getElementById('chartAgency'), Object.keys(stats.byAgencyType), Object.values(stats.byAgencyType))],
    ['chartSpecialization', () => renderBar(document.getElementById('chartSpecialization'), Object.keys(stats.bySpecialization), Object.values(stats.bySpecialization))]
  ];

  for (const [id, render] of chartDefs) {
    const canvasEl = document.getElementById(id);
    if (!canvasEl) continue;
    if (!chartOk) {
      showChartFallback(canvasEl, 'ไม่สามารถโหลดไลบรารีสร้างกราฟได้ในขณะนี้ (เครือข่ายอาจบล็อก CDN) — ข้อมูลตัวเลขยังถูกต้องตามปกติ');
      continue;
    }
    try { render(); } catch (e) { showChartFallback(canvasEl, 'ไม่สามารถแสดงกราฟนี้ได้: ' + e.message); }
  }
}

async function loadDashboard() {
  let stats;
  try {
    stats = await Api.stats();
  } catch (e) {
    document.getElementById('dashboardWrap').innerHTML =
      `<div class="alert alert-error">ไม่สามารถโหลดข้อมูลแดชบอร์ดได้: ${escapeHtml(e.message)}<br>โปรดตรวจสอบว่าได้ตั้งค่า API_URL ใน js/api.js เรียบร้อยแล้ว</div>`;
    return;
  }

  // แสดง KPI และตารางก่อน ไม่ให้ปัญหาการโหลดกราฟ (เช่น CDN ถูกบล็อก) มาบังข้อมูลตัวเลขที่โหลดสำเร็จแล้ว
  const kpis = document.querySelectorAll('#kpiGrid .kpi .num');
  kpis[0].textContent = stats.total.toLocaleString('th-TH');
  kpis[1].textContent = stats.licenseRate + '%';
  kpis[2].textContent = stats.expiringLicensesCount.toLocaleString('th-TH');
  kpis[3].textContent = stats.disciplineCaseCount.toLocaleString('th-TH');

  try {
    const { byProvince } = await Api.provinces();
    const rows = Object.entries(byProvince).sort((a, b) => b[1] - a[1]);
    document.getElementById('provinceTableBody').innerHTML = rows.map(([prov, n]) =>
      `<tr><td>${escapeHtml(prov)}</td><td>${n.toLocaleString('th-TH')}</td></tr>`
    ).join('') || '<tr><td colspan="2" class="text-soft">ยังไม่มีข้อมูล</td></tr>';
  } catch (e) {
    document.getElementById('provinceTableBody').innerHTML = `<tr><td colspan="2" class="text-soft">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
  }

  renderAllCharts(stats);
}

loadDashboard();
