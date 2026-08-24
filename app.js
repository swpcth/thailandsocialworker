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

function showProvinceDetail(name, count) {
  document.getElementById('provinceDetailPanel').innerHTML = `
    <div class="card" style="background:#f2f5f8;">
      <div class="result-name">${escapeHtml(name)}</div>
      <div class="result-meta mt-8">${count.toLocaleString('th-TH')} คน ที่ลงทะเบียนในระบบ</div>
    </div>`;
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

  const kpis = document.querySelectorAll('#kpiGrid .kpi .num');
  kpis[0].textContent = stats.total.toLocaleString('th-TH');
  kpis[1].textContent = stats.licenseRate + '%';
  kpis[2].textContent = stats.expiringLicensesCount.toLocaleString('th-TH');

  let byProvince = {};
  try {
    byProvince = (await Api.provinces()).byProvince;
  } catch (e) { /* ปล่อยผ่าน แผนที่จะแสดงเป็นสีอ่อนทั้งหมดแทน */ }

  const topList = Object.entries(byProvince).sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById('topProvincesList').innerHTML = topList.length
    ? `<ol style="padding-left:20px; margin:0;">${topList.map(([prov, n]) => `<li class="mt-8">${escapeHtml(prov)} — <strong>${n.toLocaleString('th-TH')}</strong> คน</li>`).join('')}</ol>`
    : '<p class="text-sm text-soft">ยังไม่มีข้อมูล</p>';

  renderThailandMap('publicMap', byProvince, { height: 480, onProvinceClick: showProvinceDetail });
}

loadDashboard();
