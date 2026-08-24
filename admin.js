let adminToken = null; // mirrored into sessionStorage so it survives the ThaiD redirect round-trip
let adminDisplayName = '', adminRole = '';
let peopleCache = [];

function enterAdminApp(displayName, role) {
  adminDisplayName = displayName; adminRole = role;
  document.getElementById('adminWelcome').textContent = `เข้าสู่ระบบในนาม ${displayName || 'เจ้าหน้าที่'} (${role || ''})`;
  document.getElementById('adminLoginView').style.display = 'none';
  document.getElementById('adminAppView').style.display = '';
  // รายงาน/แท็บวินัย-จริยธรรม มีข้อมูลอ่อนไหว จำกัดสิทธิ์การเข้าถึงเฉพาะผู้มีอำนาจ (superadmin) ตาม TOR 5.2.4.2 ข้อ 9
  const disciplineBtn = document.getElementById('tabBtnDiscipline');
  const disciplineAllowed = role === 'superadmin';
  disciplineBtn.style.display = disciplineAllowed ? '' : 'none';
  const disciplineOption = document.querySelector('#reportSelect option[value="discipline"]');
  if (disciplineOption) disciplineOption.style.display = disciplineAllowed ? '' : 'none';
  loadAllAdminData();
  loadMfaStatus();
}

// ---------------- Login ขั้นที่ 1: ชื่อผู้ใช้ + รหัสผ่าน ----------------
let pendingMfaUsername = null;

document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังเข้าสู่ระบบ...';
  try {
    const res = await Api.adminLogin(username, password);
    if (res.mfaRequired) {
      pendingMfaUsername = username;
      document.getElementById('adminPasswordStep').style.display = 'none';
      document.getElementById('adminOtpStep').style.display = '';
      document.getElementById('adminOtpMaskedEmail').textContent = res.maskedEmail || '';
      document.getElementById('adminOtpAlert').innerHTML = '';
      document.getElementById('adminOtpInput').value = '';
      document.getElementById('adminOtpInput').focus();
    } else {
      adminToken = res.token;
      sessionStorage.setItem('swdb_admin_token', adminToken);
      enterAdminApp(res.displayName || username, res.role);
    }
  } catch (err) {
    const msg = err.message === 'mfa_no_email' ? 'บัญชีนี้เปิดใช้งาน MFA แต่ยังไม่มีอีเมลผูกไว้ กรุณาติดต่อผู้ดูแลระบบ'
      : 'เข้าสู่ระบบไม่สำเร็จ: ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    document.getElementById('adminLoginAlert').innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบด้วยรหัสผ่าน';
  }
});

// ---------------- Login ขั้นที่ 2: ยืนยันรหัส OTP ที่ส่งไปยังอีเมล ----------------
document.getElementById('adminVerifyOtpBtn').addEventListener('click', async () => {
  const otp = document.getElementById('adminOtpInput').value.trim();
  const btn = document.getElementById('adminVerifyOtpBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังยืนยัน...';
  try {
    const res = await Api.adminVerifyLoginOtp(pendingMfaUsername, otp);
    adminToken = res.token;
    sessionStorage.setItem('swdb_admin_token', adminToken);
    enterAdminApp(res.displayName || pendingMfaUsername, res.role);
  } catch (err) {
    const msg = err.message === 'otp_expired' ? 'รหัส OTP หมดอายุแล้ว กรุณากลับไปเข้าสู่ระบบใหม่เพื่อขอรหัสอีกครั้ง'
      : 'รหัส OTP ไม่ถูกต้อง';
    document.getElementById('adminOtpAlert').innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'ยืนยันรหัส OTP';
  }
});

document.getElementById('adminBackToPasswordBtn').addEventListener('click', () => {
  pendingMfaUsername = null;
  document.getElementById('adminOtpStep').style.display = 'none';
  document.getElementById('adminPasswordStep').style.display = '';
  document.getElementById('adminPassword').value = '';
});

// ---------------- Login via ThaiD ----------------
document.getElementById('thaidStaffLoginBtn').addEventListener('click', async () => {
  const btn = document.getElementById('thaidStaffLoginBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังเชื่อมต่อ...';
  try {
    const res = await Api.thaidLoginUrl('staff');
    if (!res.configured) {
      document.getElementById('thaidStaffAlert').innerHTML = `<div class="alert alert-info">${escapeHtml(res.message)}</div>`;
      return;
    }
    window.location.href = res.url;
  } catch (err) {
    document.getElementById('thaidStaffAlert').innerHTML = `<div class="alert alert-error">เชื่อมต่อ ThaiD ไม่สำเร็จ: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบด้วย ThaiD';
  }
});

function adminLogout() {
  adminToken = null;
  pendingMfaUsername = null;
  sessionStorage.removeItem('swdb_admin_token');
  document.getElementById('adminAppView').style.display = 'none';
  document.getElementById('adminLoginView').style.display = '';
  document.getElementById('adminOtpStep').style.display = 'none';
  document.getElementById('adminPasswordStep').style.display = '';
  document.getElementById('adminUsername').value = '';
  document.getElementById('adminPassword').value = '';
}

// ถ้ากลับมาจากหน้า ThaiD (thaid-callback.html เขียน token ไว้ให้แล้ว) ให้เข้าระบบทันทีโดยไม่ต้องกรอกรหัสผ่าน
(function restoreAdminSession() {
  const token = sessionStorage.getItem('swdb_admin_token');
  if (!token) return;
  adminToken = token;
  Api.adminWhoami(adminToken).then(res => {
    enterAdminApp(res.displayName || res.username, res.role);
  }).catch(() => {
    adminToken = null;
    sessionStorage.removeItem('swdb_admin_token');
  });
})();

// ---------------- MFA (Email OTP) setup ----------------
async function loadMfaStatus() {
  document.getElementById('mfaStatusText').textContent = 'สถานะ MFA: จะเปิดใช้งานอัตโนมัติเมื่อยืนยัน OTP ที่ส่งไปยังอีเมลสำเร็จครั้งแรก (กดปุ่ม "ตั้งค่า MFA" เพื่อเริ่ม)';
}

document.getElementById('mfaSetupBtn').addEventListener('click', () => {
  const panel = document.getElementById('mfaSetupPanel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
});

document.getElementById('mfaSendOtpBtn').addEventListener('click', async () => {
  const email = document.getElementById('mfaEmailInput').value.trim();
  const btn = document.getElementById('mfaSendOtpBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังส่ง...';
  try {
    const res = await Api.adminSetupMfa(adminToken, email);
    document.getElementById('mfaSetupAlert').innerHTML = `<span style="color:var(--green-ok);">ส่งรหัส OTP ไปยัง ${escapeHtml(res.maskedEmail)} แล้ว กรุณาตรวจสอบอีเมล (อายุรหัส 10 นาที)</span>`;
  } catch (err) {
    const msg = err.message === 'invalid_email' ? 'รูปแบบอีเมลไม่ถูกต้อง' : 'ส่งรหัส OTP ไม่สำเร็จ: ' + err.message;
    document.getElementById('mfaSetupAlert').innerHTML = `<span style="color:var(--red-bad);">${escapeHtml(msg)}</span>`;
  } finally {
    btn.disabled = false; btn.textContent = 'ส่งรหัส OTP ไปยังอีเมลนี้';
  }
});

document.getElementById('mfaConfirmBtn').addEventListener('click', async () => {
  const otp = document.getElementById('mfaConfirmOtp').value.trim();
  try {
    await Api.adminConfirmMfa(adminToken, otp);
    toast('เปิดใช้งาน MFA สำเร็จ ครั้งต่อไปที่เข้าสู่ระบบด้วยรหัสผ่าน ระบบจะส่งรหัส OTP ไปยังอีเมลนี้ทุกครั้ง');
    document.getElementById('mfaSetupPanel').style.display = 'none';
    document.getElementById('mfaStatusText').textContent = 'สถานะ MFA: เปิดใช้งานแล้ว ✅';
  } catch (err) {
    const msg = err.message === 'otp_expired' ? 'รหัส OTP หมดอายุแล้ว กรุณาส่งรหัสใหม่อีกครั้ง' : 'รหัส OTP ไม่ถูกต้อง';
    toast(msg, 'error');
  }
});

// ---------------- Tabs ----------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

function loadAllAdminData() {
  loadAdminDashboard();
  loadPeople();
  if (adminRole === 'superadmin') loadDiscipline();
  loadAgencies();
  loadAudit();
}

// ---------------- Dashboard (ฉบับเต็มสำหรับเจ้าหน้าที่) ----------------
let latestStatsCache = null, latestProvinceCache = null;

async function loadAdminDashboard() {
  try {
    const stats = await Api.stats();
    latestStatsCache = stats;
    const nums = document.querySelectorAll('#adminKpi .num');
    nums[0].textContent = stats.total.toLocaleString('th-TH');
    nums[1].textContent = stats.licenseRate + '%';
    nums[2].textContent = stats.expiringLicensesCount.toLocaleString('th-TH');
    nums[3].textContent = stats.disciplineCaseCount.toLocaleString('th-TH');

    const mom = stats.newRegistrationsMoM || {};
    const diff = (mom.thisMonth || 0) - (mom.lastMonth || 0);
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
    document.getElementById('momText').textContent =
      `การลงทะเบียนใหม่เดือนนี้: ${(mom.thisMonth || 0).toLocaleString('th-TH')} คน (เทียบเดือนก่อนหน้า ${(mom.lastMonth || 0).toLocaleString('th-TH')} คน ${arrow} ${Math.abs(diff)}) — คำนวณจากจำนวนบัญชีที่ลงทะเบียนใหม่ เนื่องจากระบบยังไม่มีการเก็บภาพรวม KPI ย้อนหลังแบบรายเดือนเต็มรูปแบบ`;

    document.getElementById('expiringTableBody').innerHTML = stats.expiringLicenses.length
      ? stats.expiringLicenses.map(p => `<tr><td>${escapeHtml(p.PersonID)}</td><td>${escapeHtml(p.Name)}</td><td>${escapeHtml(p.Province)}</td><td>${fmtDate(p.LicenseExpireDate)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="text-soft">ไม่มีใบอนุญาตที่ใกล้หมดอายุ</td></tr>';

    let byProvince = {};
    try { byProvince = (await Api.provinces()).byProvince; latestProvinceCache = byProvince; } catch (e) {}

    renderProvinceRanking(byProvince, 'top');
    renderAgencyRanking(stats.byAgencyName || {});
    renderThailandMap('adminMap', byProvince, { height: 480, onProvinceClick: (name) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="tabPeople"]').classList.add('active');
      document.getElementById('tabPeople').classList.add('active');
      document.getElementById('peopleFilter').value = name;
      renderPeopleTable(peopleCache.filter(p => (p.FirstName + p.LastName + p.PersonID + p.AgencyName + p.Province).toLowerCase().includes(name.toLowerCase())));
    }});

    renderChartsSafely([
      ['chartPosition', () => renderPie(document.getElementById('chartPosition'), Object.keys(stats.byPosition), Object.values(stats.byPosition))],
      ['chartAgency', () => renderPie(document.getElementById('chartAgency'), Object.keys(stats.byAgencyType), Object.values(stats.byAgencyType))],
      ['chartSpecialization', () => renderBar(document.getElementById('chartSpecialization'), Object.keys(stats.bySpecialization), Object.values(stats.bySpecialization))],
      ['chartTrend', () => renderLine(document.getElementById('chartTrend'), (stats.registrationTrend || {}).months || [], (stats.registrationTrend || {}).counts || [])]
    ]);
  } catch (e) { toast('โหลดข้อมูลภาพรวมไม่สำเร็จ: ' + e.message, 'error'); }
}

function renderProvinceRanking(byProvince, mode) {
  const rows = Object.entries(byProvince).sort((a, b) => mode === 'top' ? b[1] - a[1] : a[1] - b[1]).slice(0, 5);
  document.getElementById('provinceRankingList').innerHTML = rows.length
    ? `<ol style="padding-left:20px; margin:0;">${rows.map(([prov, n]) => `<li class="mt-8">${escapeHtml(prov)} — <strong>${n.toLocaleString('th-TH')}</strong></li>`).join('')}</ol>`
    : '<p class="text-sm text-soft">ยังไม่มีข้อมูล</p>';
}

function renderAgencyRanking(byAgencyName) {
  const rows = Object.entries(byAgencyName).sort((a, b) => b[1] - a[1]).slice(0, 5);
  document.getElementById('agencyRankingList').innerHTML = rows.length
    ? `<ol style="padding-left:20px; margin:0;">${rows.map(([a, n]) => `<li class="mt-8">${escapeHtml(a)} — <strong>${n.toLocaleString('th-TH')}</strong></li>`).join('')}</ol>`
    : '<p class="text-sm text-soft">ยังไม่มีข้อมูล</p>';
}

document.querySelectorAll('.rank-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rank-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderProvinceRanking(latestProvinceCache || {}, btn.dataset.rank);
  });
});

// การจัดกลุ่มจังหวัดเป็น 6 ภูมิภาค (ตามเกณฑ์ สศช./NESDB) — ใช้สำหรับรายงานเชิงพื้นที่ ข้อ 5.2.4.2.2
const PROVINCE_REGION = {
  'เชียงใหม่':'เหนือ','เชียงราย':'เหนือ','แม่ฮ่องสอน':'เหนือ','ลำปาง':'เหนือ','ลำพูน':'เหนือ','พะเยา':'เหนือ','แพร่':'เหนือ','น่าน':'เหนือ','อุตรดิตถ์':'เหนือ','ตาก':'เหนือ','สุโขทัย':'เหนือ','พิษณุโลก':'เหนือ','กำแพงเพชร':'เหนือ','พิจิตร':'เหนือ','เพชรบูรณ์':'เหนือ','นครสวรรค์':'เหนือ','อุทัยธานี':'เหนือ',
  'กรุงเทพมหานคร':'กลาง','นนทบุรี':'กลาง','ปทุมธานี':'กลาง','สมุทรปราการ':'กลาง','นครปฐม':'กลาง','สมุทรสาคร':'กลาง','สมุทรสงคราม':'กลาง','พระนครศรีอยุธยา':'กลาง','อ่างทอง':'กลาง','ลพบุรี':'กลาง','สิงห์บุรี':'กลาง','ชัยนาท':'กลาง','สระบุรี':'กลาง','สุพรรณบุรี':'กลาง','นครนายก':'กลาง',
  'นครราชสีมา':'ตะวันออกเฉียงเหนือ','บุรีรัมย์':'ตะวันออกเฉียงเหนือ','สุรินทร์':'ตะวันออกเฉียงเหนือ','ศรีสะเกษ':'ตะวันออกเฉียงเหนือ','อุบลราชธานี':'ตะวันออกเฉียงเหนือ','ยโสธร':'ตะวันออกเฉียงเหนือ','ชัยภูมิ':'ตะวันออกเฉียงเหนือ','อำนาจเจริญ':'ตะวันออกเฉียงเหนือ','บึงกาฬ':'ตะวันออกเฉียงเหนือ','หนองบัวลำภู':'ตะวันออกเฉียงเหนือ','ขอนแก่น':'ตะวันออกเฉียงเหนือ','อุดรธานี':'ตะวันออกเฉียงเหนือ','เลย':'ตะวันออกเฉียงเหนือ','หนองคาย':'ตะวันออกเฉียงเหนือ','มหาสารคาม':'ตะวันออกเฉียงเหนือ','ร้อยเอ็ด':'ตะวันออกเฉียงเหนือ','กาฬสินธุ์':'ตะวันออกเฉียงเหนือ','สกลนคร':'ตะวันออกเฉียงเหนือ','นครพนม':'ตะวันออกเฉียงเหนือ','มุกดาหาร':'ตะวันออกเฉียงเหนือ',
  'ชลบุรี':'ตะวันออก','ระยอง':'ตะวันออก','จันทบุรี':'ตะวันออก','ตราด':'ตะวันออก','ฉะเชิงเทรา':'ตะวันออก','ปราจีนบุรี':'ตะวันออก','สระแก้ว':'ตะวันออก',
  'กาญจนบุรี':'ตะวันตก','ราชบุรี':'ตะวันตก','เพชรบุรี':'ตะวันตก','ประจวบคีรีขันธ์':'ตะวันตก',
  'ชุมพร':'ใต้','ระนอง':'ใต้','สุราษฎร์ธานี':'ใต้','พังงา':'ใต้','ภูเก็ต':'ใต้','กระบี่':'ใต้','นครศรีธรรมราช':'ใต้','ตรัง':'ใต้','พัทลุง':'ใต้','สตูล':'ใต้','สงขลา':'ใต้','ปัตตานี':'ใต้','ยะลา':'ใต้','นราธิวาส':'ใต้'
};

// ---------------- รายงาน (Standard Reports) ----------------
function groupBy(arr, keyFn) {
  const out = {};
  arr.forEach(item => {
    const k = keyFn(item) || 'ไม่ระบุ';
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function renderCountTable(dict, headers) {
  headers = headers || ['รายการ', 'จำนวน'];
  const rows = Object.entries(dict).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>${headers[0]}</th><th>${headers[1]}</th><th>ร้อยละ</th></tr></thead><tbody>${
    rows.map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td>${n.toLocaleString('th-TH')}</td><td>${total ? (n / total * 100).toFixed(1) : 0}%</td></tr>`).join('') ||
    '<tr><td colspan="3" class="text-soft">ไม่มีข้อมูล</td></tr>'
  }</tbody></table></div>`;
}

async function renderReport(type) {
  const el = document.getElementById('reportContent');
  el.innerHTML = '<p class="text-sm text-soft">กำลังโหลดรายงาน...</p>';
  const stats = latestStatsCache || await Api.stats();
  const people = peopleCache;

  if (type === 'overview') {
    const mb = stats.membershipBreakdown;
    el.innerHTML = `
      <div class="grid grid-3">
        <div class="card kpi"><div class="num">${stats.total.toLocaleString('th-TH')}</div><div class="label">ผู้ปฏิบัติงานทั้งหมด</div></div>
        <div class="card kpi accent-green"><div class="num">${stats.licenseRate}%</div><div class="label">อัตรามีใบอนุญาต</div></div>
        <div class="card kpi accent-gold"><div class="num">${stats.expiringLicensesCount}</div><div class="label">ใบอนุญาตใกล้หมดอายุ</div></div>
      </div>
      <div class="card mt-16"><h3 style="margin-top:0;">สถานะสมาชิกภาพ/ใบอนุญาตร่วมกัน</h3>
      ${renderCountTable({ 'สมาชิกภาพ + มีใบอนุญาต': mb.bothMemberAndLicense, 'สมาชิกภาพอย่างเดียว': mb.memberOnly, 'ไม่เป็นทั้งสองอย่าง': mb.neither }, ['กลุ่ม', 'จำนวน'])}
      </div>`;
  } else if (type === 'area') {
    const byRegion = {};
    Object.entries(latestProvinceCache || {}).forEach(([prov, n]) => {
      const region = PROVINCE_REGION[prov] || 'ไม่ระบุภูมิภาค';
      byRegion[region] = (byRegion[region] || 0) + n;
    });
    el.innerHTML = `
      <div class="card"><h3 style="margin-top:0;">จำนวนผู้ปฏิบัติงานแยกตามภูมิภาค (6 ภูมิภาค)</h3>${renderCountTable(byRegion, ['ภูมิภาค', 'จำนวน'])}</div>
      <div class="card mt-16"><h3 style="margin-top:0;">จำนวนผู้ปฏิบัติงานรายจังหวัด (ทั้งหมด)</h3>${renderCountTable(latestProvinceCache || {}, ['จังหวัด', 'จำนวน'])}</div>`;
  } else if (type === 'agency') {
    el.innerHTML = `
      <div class="card"><h3 style="margin-top:0;">แยกตามประเภทหน่วยงาน</h3>${renderCountTable(groupBy(people, p => p.AgencyType), ['ประเภทหน่วยงาน', 'จำนวน'])}</div>
      <div class="card mt-16"><h3 style="margin-top:0;">แยกตามหน่วยงานรายแห่ง</h3>${renderCountTable(groupBy(people, p => p.AgencyName), ['หน่วยงาน', 'จำนวน'])}</div>`;
  } else if (type === 'position') {
    el.innerHTML = `<div class="card"><h3 style="margin-top:0;">แยกตามประเภทตำแหน่งงาน</h3>${renderCountTable(groupBy(people, p => p.PositionType), ['ตำแหน่งงาน', 'จำนวน'])}</div>`;
  } else if (type === 'license') {
    const labelMap = { active: 'ปกติ', expired: 'หมดอายุ', suspended: 'ถูกพักใช้', revoked: 'ถูกเพิกถอน', none: 'ไม่มีใบอนุญาต' };
    const dict = {};
    Object.entries(stats.licenseStatusBreakdown || {}).forEach(([k, v]) => { dict[labelMap[k] || k] = v; });
    el.innerHTML = `<div class="card"><h3 style="margin-top:0;">สถานะใบอนุญาต</h3>${renderCountTable(dict, ['สถานะ', 'จำนวน'])}</div>
      <div class="card mt-16"><h3 style="margin-top:0;">รายชื่อใกล้หมดอายุ (90 วัน)</h3>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>รหัส</th><th>ชื่อ-สกุล</th><th>จังหวัด</th><th>วันหมดอายุ</th></tr></thead>
      <tbody>${(stats.expiringLicenses || []).map(p => `<tr><td>${escapeHtml(p.PersonID)}</td><td>${escapeHtml(p.Name)}</td><td>${escapeHtml(p.Province)}</td><td>${fmtDate(p.LicenseExpireDate)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-soft">ไม่มี</td></tr>'}</tbody></table></div></div>`;
  } else if (type === 'membership') {
    const labelMap = { active: 'ปกติ', ended: 'สิ้นสุด', none: 'ไม่เป็นสมาชิก' };
    el.innerHTML = `<div class="card"><h3 style="margin-top:0;">สถานะสมาชิกภาพ</h3>${renderCountTable(groupBy(people, p => labelMap[p.MembershipStatus] || p.MembershipStatus), ['สถานะ', 'จำนวน'])}</div>
      <div class="card mt-16"><h3 style="margin-top:0;">แยกตามประเภทสมาชิก</h3>${renderCountTable(groupBy(people.filter(p => p.MembershipStatus === 'active'), p => p.MembershipType), ['ประเภทสมาชิก', 'จำนวน'])}</div>`;
  } else if (type === 'specialization') {
    el.innerHTML = `<div class="card"><h3 style="margin-top:0;">แยกตามความเชี่ยวชาญ</h3>${renderCountTable(stats.bySpecialization || {}, ['ความเชี่ยวชาญ', 'จำนวน'])}</div>`;
  } else if (type === 'education') {
    el.innerHTML = `<div class="card"><h3 style="margin-top:0;">แยกตามระดับการศึกษา</h3>${renderCountTable(groupBy(people, p => p.EducationLevel), ['ระดับการศึกษา', 'จำนวน'])}</div>
      <div class="card mt-16"><h3 style="margin-top:0;">แยกตามสาขาวิชา</h3>${renderCountTable(groupBy(people, p => p.EducationField), ['สาขาวิชา', 'จำนวน'])}</div>`;
  } else if (type === 'discipline') {
    if (adminRole !== 'superadmin') { el.innerHTML = '<div class="alert alert-error">รายงานนี้จำกัดสิทธิ์เฉพาะผู้ดูแลระบบระดับสูง (superadmin)</div>'; return; }
    try {
      const { items } = await Api.adminListDiscipline(adminToken);
      el.innerHTML = `<div class="card"><h3 style="margin-top:0;">แยกตามประเภทกรณี</h3>${renderCountTable(groupBy(items, d => d.CaseType), ['ประเภทกรณี', 'จำนวน'])}</div>
        <div class="card mt-16"><h3 style="margin-top:0;">แยกตามสถานะคดี</h3>${renderCountTable(groupBy(items, d => d.CaseStatus), ['สถานะคดี', 'จำนวน'])}</div>`;
    } catch (e) { el.innerHTML = `<div class="alert alert-error">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</div>`; }
  } else if (type === 'trend') {
    const t = stats.registrationTrend || { months: [], counts: [] };
    el.innerHTML = `<div class="card"><h3 style="margin-top:0;">แนวโน้มการลงทะเบียนใหม่รายเดือน (12 เดือนล่าสุด)</h3>
      <canvas id="reportTrendChart" height="220"></canvas>
      <div class="table-scroll mt-16"><table class="data-table"><thead><tr><th>เดือน</th><th>จำนวนลงทะเบียนใหม่</th></tr></thead>
      <tbody>${t.months.map((m, i) => `<tr><td>${m}</td><td>${t.counts[i].toLocaleString('th-TH')}</td></tr>`).join('')}</tbody></table></div></div>`;
    renderChartsSafely([['reportTrendChart', () => renderLine(document.getElementById('reportTrendChart'), t.months, t.counts)]]);
  }
}

document.getElementById('reportSelect').addEventListener('change', (e) => renderReport(e.target.value));

// ---------------- People ----------------
async function loadPeople() {
  try {
    const { items } = await Api.adminListPersons(adminToken);
    peopleCache = items.filter(p => p.Status !== 'deleted');
    renderPeopleTable(peopleCache);
  } catch (e) {
    document.getElementById('peopleTableBody').innerHTML = `<tr><td colspan="8" class="text-soft">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function renderPeopleTable(items) {
  document.getElementById('peopleTableBody').innerHTML = items.length ? items.map(p => `
    <tr>
      <td>${escapeHtml(p.PersonID)}</td>
      <td>${escapeHtml(p.Prefix || '')}${escapeHtml(p.FirstName)} ${escapeHtml(p.LastName)}</td>
      <td>${escapeHtml(p.PositionType || '-')}</td>
      <td>${escapeHtml(p.AgencyName || '-')}</td>
      <td>${escapeHtml(p.Province || '-')}</td>
      <td>${p.MembershipStatus === 'active' ? '<span class="badge badge-green">ปกติ</span>' : '<span class="badge badge-gray">-</span>'}</td>
      <td>${p.LicenseStatus === 'active' ? '<span class="badge badge-green">ปกติ</span>' : '<span class="badge badge-gray">-</span>'}</td>
      <td class="flex gap-8">
        <button class="btn btn-ghost btn-sm" onclick="openPersonForm('${p.PersonID}')">แก้ไข</button>
        <button class="btn btn-danger btn-sm" onclick="deletePerson('${p.PersonID}')">ลบ</button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="8" class="text-soft">ไม่มีข้อมูล</td></tr>';
}

document.getElementById('peopleFilter').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = peopleCache.filter(p =>
    (p.FirstName + p.LastName + p.PersonID + p.AgencyName + p.Province).toLowerCase().indexOf(q) !== -1
  );
  renderPeopleTable(filtered);
});

// ---------------- "อื่นๆ" -> ช่องกรอกข้อความเพิ่มเติม (แบบฟอร์มผู้ดูแลระบบ) ----------------
function wireAdminOtherToggle(selectId, otherId) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  select.addEventListener('change', () => {
    other.style.display = (select.value === 'อื่นๆ') ? '' : 'none';
    if (select.value !== 'อื่นๆ') other.value = '';
  });
}
wireAdminOtherToggle('adm_prefixSelect', 'adm_prefixOther');
wireAdminOtherToggle('adm_eduLevelSelect', 'adm_eduLevelOther');
wireAdminOtherToggle('adm_positionTypeSelect', 'adm_positionTypeOther');

function applyAdminOtherOverrides(data) {
  const prefixOther = document.getElementById('adm_prefixOther').value.trim();
  if (data.Prefix === 'อื่นๆ' && prefixOther) data.Prefix = prefixOther;
  const eduOther = document.getElementById('adm_eduLevelOther').value.trim();
  if (data.EducationLevel === 'อื่นๆ' && eduOther) data.EducationLevel = eduOther;
  const posOther = document.getElementById('adm_positionTypeOther').value.trim();
  if (data.PositionType === 'อื่นๆ' && posOther) data.PositionType = posOther;
  return data;
}

// เลือก "อื่นๆ" อัตโนมัติในช่อง select ถ้าค่าที่บันทึกไว้ไม่ตรงกับตัวเลือกที่มี แล้วเติมค่าจริงในช่องข้อความ "อื่นๆ"
function setAdminSelectWithOther(selectEl, otherEl, value) {
  if (!value) { selectEl.value = ''; otherEl.style.display = 'none'; otherEl.value = ''; return; }
  const known = Array.from(selectEl.options).some(o => o.value === value);
  if (known) { selectEl.value = value; otherEl.style.display = 'none'; otherEl.value = ''; }
  else { selectEl.value = 'อื่นๆ'; otherEl.style.display = ''; otherEl.value = value; }
}

// ---------------- ที่อยู่: จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ แบบ cascading dropdown ----------------
function initAdminAddressDropdowns(root = document) {
  const data = window.THAI_ADDRESS;
  if (!data) return;

  root.querySelectorAll('.addr-province').forEach(sel => {
    if (sel.dataset.filled) return; // กันเติมตัวเลือกซ้ำ
    data.provinces.slice().sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name; opt.dataset.code = p.code; opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.dataset.filled = '1';
  });

  function districtsFor(provinceCode) { return data.districts.filter(d => d.provinceCode === provinceCode); }
  function subdistrictsFor(districtCode) { return data.subdistricts.filter(s => s.districtCode === districtCode); }

  root.querySelectorAll('.addr-province').forEach(provSel => {
    if (provSel.dataset.wired) return;
    provSel.dataset.wired = '1';
    const group = provSel.dataset.group;
    const distSel = root.querySelector(`.addr-district[data-group="${group}"]`);
    const subSel = root.querySelector(`.addr-subdistrict[data-group="${group}"]`);
    const zipInput = root.querySelector(`.addr-zipcode[data-group="${group}"]`);

    provSel.addEventListener('change', () => {
      const code = provSel.selectedOptions[0] ? parseInt(provSel.selectedOptions[0].dataset.code, 10) : null;
      distSel.innerHTML = '<option value="">เลือกอำเภอ/เขต</option>';
      subSel.innerHTML = '<option value="">เลือกอำเภอก่อน</option>';
      zipInput.value = '';
      if (!code) return;
      districtsFor(code).sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.name; opt.dataset.code = d.code; opt.textContent = d.name;
        distSel.appendChild(opt);
      });
    });

    distSel.addEventListener('change', () => {
      const code = distSel.selectedOptions[0] ? parseInt(distSel.selectedOptions[0].dataset.code, 10) : null;
      subSel.innerHTML = '<option value="">เลือกตำบล/แขวง</option>';
      zipInput.value = '';
      if (!code) return;
      subdistrictsFor(code).sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name; opt.dataset.zip = s.zip; opt.textContent = s.name;
        subSel.appendChild(opt);
      });
    });

    subSel.addEventListener('change', () => {
      const zip = subSel.selectedOptions[0] ? subSel.selectedOptions[0].dataset.zip : '';
      zipInput.value = zip || '';
    });
  });
}
initAdminAddressDropdowns();

// เติมค่า select ที่อยู่ (จังหวัด->อำเภอ->ตำบล) แบบไล่ลำดับ โดยจำลอง change event เพื่อให้ตัวเลือกลูกถูกเติมตาม
function fillAdminAddressGroup(form, group, p) {
  const provSel = form[`${group}_Province`], distSel = form[`${group}_District`], subSel = form[`${group}_Subdistrict`], zipInput = form[`${group}_Zipcode`];
  provSel.value = p[`${group}_Province`] || '';
  provSel.dispatchEvent(new Event('change'));
  setTimeout(() => {
    distSel.value = p[`${group}_District`] || '';
    distSel.dispatchEvent(new Event('change'));
    setTimeout(() => {
      subSel.value = p[`${group}_Subdistrict`] || '';
      subSel.dispatchEvent(new Event('change'));
      zipInput.value = p[`${group}_Zipcode`] || zipInput.value;
    }, 0);
  }, 0);
}

const adminCurrentAddrFields = ['Current_No', 'Current_Village', 'Current_Building', 'Current_Soi', 'Current_Road'];
function copyAdminHouseToCurrent() {
  const form = document.getElementById('personForm');
  adminCurrentAddrFields.forEach(f => { form[f].value = form[f.replace('Current_', 'House_')].value; });
  const hProv = form.House_Province, hDist = form.House_District, hSub = form.House_Subdistrict;
  const cProv = form.Current_Province, cDist = form.Current_District, cSub = form.Current_Subdistrict, cZip = form.Current_Zipcode;
  cProv.value = hProv.value; cProv.dispatchEvent(new Event('change'));
  setTimeout(() => {
    cDist.value = hDist.value; cDist.dispatchEvent(new Event('change'));
    setTimeout(() => {
      cSub.value = hSub.value; cSub.dispatchEvent(new Event('change'));
      cZip.value = form.House_Zipcode.value;
    }, 0);
  }, 0);
}
document.getElementById('adm_sameAsHouse').addEventListener('change', (e) => {
  if (e.target.checked) copyAdminHouseToCurrent();
});

function openPersonForm(personId) {
  const wrap = document.getElementById('personFormWrap');
  const form = document.getElementById('personForm');
  form.reset();
  ['House_District', 'House_Subdistrict', 'Current_District', 'Current_Subdistrict'].forEach(f => { form[f].innerHTML = '<option value="">เลือกจังหวัดก่อน</option>'; });
  document.getElementById('adm_prefixOther').style.display = 'none';
  document.getElementById('adm_eduLevelOther').style.display = 'none';
  document.getElementById('adm_positionTypeOther').style.display = 'none';
  document.getElementById('adm_sameAsHouse').checked = false;
  document.getElementById('personFormAlert').innerHTML = '';
  wrap.style.display = '';
  document.getElementById('personFormTitle').textContent = personId ? 'แก้ไขข้อมูลผู้ปฏิบัติงาน' : 'เพิ่มผู้ปฏิบัติงาน';

  if (personId) {
    const p = peopleCache.find(x => x.PersonID === personId);
    if (p) {
      const addressFields = new Set(['House_Province', 'House_District', 'House_Subdistrict', 'Current_Province', 'Current_District', 'Current_Subdistrict']);
      Object.keys(p).forEach(k => {
        if (form[k] && !addressFields.has(k) && k !== 'Prefix' && k !== 'EducationLevel' && k !== 'PositionType') {
          form[k].value = p[k] instanceof Date ? '' : (p[k] || '');
        }
      });
      form.PersonID.value = personId;
      setAdminSelectWithOther(form.Prefix, document.getElementById('adm_prefixOther'), p.Prefix || '');
      setAdminSelectWithOther(form.EducationLevel, document.getElementById('adm_eduLevelOther'), p.EducationLevel || '');
      setAdminSelectWithOther(form.PositionType, document.getElementById('adm_positionTypeOther'), p.PositionType || '');
      fillAdminAddressGroup(form, 'House', p);
      fillAdminAddressGroup(form, 'Current', p);
      ['MembershipExpireDate', 'LicenseExpireDate'].forEach(f => {
        if (p[f]) form[f].value = new Date(p[f]).toISOString().slice(0, 10);
      });
    }
  }
  wrap.scrollIntoView({ behavior: 'smooth' });
}

function closePersonForm() { document.getElementById('personFormWrap').style.display = 'none'; }

document.getElementById('personForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  applyAdminOtherOverrides(data);
  data.Province = data.Current_Province || data.House_Province || data.Province || '';
  if (!data.PersonID) delete data.PersonID;

  let workHistoryEntry = null;
  const whAgency = document.getElementById('whAgency').value.trim();
  if (whAgency) {
    workHistoryEntry = {
      AgencyName: whAgency,
      Position: document.getElementById('whPosition').value.trim(),
      StartDate: document.getElementById('whStart').value,
      EndDate: document.getElementById('whEnd').value
    };
  }

  try {
    await Api.adminUpsertPerson(adminToken, data, workHistoryEntry);
    toast('บันทึกข้อมูลสำเร็จ');
    closePersonForm();
    loadPeople();
    loadAdminDashboard();
  } catch (err) {
    document.getElementById('personFormAlert').innerHTML = `<div class="alert alert-error">บันทึกไม่สำเร็จ: ${escapeHtml(err.message)}</div>`;
  }
});

async function deletePerson(personId) {
  if (!confirm('ยืนยันการปิดใช้งานข้อมูลนี้หรือไม่? (soft delete — สามารถกู้คืนได้จาก Google Sheet โดยตรง)')) return;
  try {
    await Api.adminDeletePerson(adminToken, personId);
    toast('ปิดใช้งานข้อมูลสำเร็จ');
    loadPeople();
    loadAdminDashboard();
  } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message, 'error'); }
}

// ---------------- Discipline ----------------
async function loadDiscipline() {
  try {
    const { items } = await Api.adminListDiscipline(adminToken);
    document.getElementById('disciplineTableBody').innerHTML = items.length ? items.map(d => `
      <tr><td>${escapeHtml(d.PersonID)}</td><td>${fmtDate(d.CaseDate)}</td><td>${escapeHtml(d.CaseType || '-')}</td><td>${escapeHtml(d.PenaltyType || '-')}</td><td>${escapeHtml(d.CaseStatus || '-')}</td></tr>
    `).join('') : '<tr><td colspan="5" class="text-soft">ไม่มีข้อมูล</td></tr>';
  } catch (e) {
    document.getElementById('disciplineTableBody').innerHTML = `<tr><td colspan="5" class="text-soft">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function openDisciplineForm() {
  document.getElementById('disciplineForm').reset();
  document.getElementById('disciplineFormWrap').style.display = '';
  document.getElementById('disciplineFormWrap').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('disciplineForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await Api.adminUpsertDiscipline(adminToken, data);
    toast('บันทึกสำเร็จ');
    document.getElementById('disciplineFormWrap').style.display = 'none';
    loadDiscipline();
    loadAdminDashboard();
  } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 'error'); }
});

// ---------------- Agencies ----------------
let agenciesCache = [];
async function loadAgencies() {
  try {
    const { items } = await Api.adminAgencies();
    agenciesCache = items;
    document.getElementById('agenciesTableBody').innerHTML = items.length ? items.map(a => `
      <tr><td>${escapeHtml(a.AgencyName)}</td><td>${escapeHtml(a.AgencyType || '-')}</td><td>${escapeHtml(a.Province || '-')}</td></tr>
    `).join('') : '<tr><td colspan="3" class="text-soft">ไม่มีข้อมูล</td></tr>';
  } catch (e) {
    document.getElementById('agenciesTableBody').innerHTML = `<tr><td colspan="3" class="text-soft">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
  }
}

function openAgencyForm() {
  document.getElementById('agencyForm').reset();
  document.getElementById('agencyFormWrap').style.display = '';
  document.getElementById('agencyFormWrap').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('agencyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.AgencyID) delete data.AgencyID;
  try {
    await Api.adminUpsertAgency(adminToken, data);
    toast('บันทึกสำเร็จ');
    document.getElementById('agencyFormWrap').style.display = 'none';
    loadAgencies();
  } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 'error'); }
});

// ---------------- Audit ----------------
async function loadAudit() {
  try {
    const { items } = await Api.adminListAudit(adminToken);
    document.getElementById('auditTableBody').innerHTML = items.length ? items.map(a => `
      <tr><td>${fmtDate(a.Timestamp)}</td><td>${escapeHtml(a.User)}</td><td>${escapeHtml(a.Action)}</td><td>${escapeHtml(a.TargetID)}</td><td>${escapeHtml((a.Detail||'').slice(0,80))}</td></tr>
    `).join('') : '<tr><td colspan="5" class="text-soft">ไม่มีข้อมูล</td></tr>';
  } catch (e) {
    document.getElementById('auditTableBody').innerHTML = `<tr><td colspan="5" class="text-soft">โหลดไม่สำเร็จ: ${escapeHtml(e.message)}</td></tr>`;
  }
}
