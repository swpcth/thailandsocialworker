let adminToken = null; // mirrored into sessionStorage so it survives the ThaiD redirect round-trip
let adminDisplayName = '', adminRole = '';
let peopleCache = [];

function enterAdminApp(displayName, role) {
  adminDisplayName = displayName; adminRole = role;
  document.getElementById('adminWelcome').textContent = `เข้าสู่ระบบในนาม ${displayName || 'เจ้าหน้าที่'} (${role || ''})`;
  document.getElementById('adminLoginView').style.display = 'none';
  document.getElementById('adminAppView').style.display = '';
  loadAllAdminData();
  loadMfaStatus();
}

// ---------------- Login (username/password + optional OTP) ----------------
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;
  const otp = document.getElementById('adminOtp').value.trim();
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังเข้าสู่ระบบ...';
  try {
    const res = await Api.adminLogin(username, password, otp);
    adminToken = res.token;
    sessionStorage.setItem('swdb_admin_token', adminToken);
    enterAdminApp(res.displayName || username, res.role);
  } catch (err) {
    const msg = err.message === 'mfa_required' ? 'บัญชีนี้เปิดใช้งาน MFA แล้ว กรุณากรอกรหัส OTP จากแอป Authenticator'
      : err.message === 'mfa_invalid' ? 'รหัส OTP ไม่ถูกต้อง'
      : 'เข้าสู่ระบบไม่สำเร็จ: ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    document.getElementById('adminLoginAlert').innerHTML = `<div class="alert alert-error">${escapeHtml(msg)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบด้วยรหัสผ่าน';
  }
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
  sessionStorage.removeItem('swdb_admin_token');
  document.getElementById('adminAppView').style.display = 'none';
  document.getElementById('adminLoginView').style.display = '';
  document.getElementById('adminUsername').value = '';
  document.getElementById('adminPassword').value = '';
  document.getElementById('adminOtp').value = '';
}

// ถ้ากลับมาจากหน้า ThaiD (thaid-callback.html เขียน token ไว้ให้แล้ว) ให้เข้าระบบทันทีโดยไม่ต้องกรอกรหัสผ่าน
(function restoreAdminSession() {
  const token = sessionStorage.getItem('swdb_admin_token');
  if (!token) return;
  adminToken = token;
  // ไม่มี endpoint "whoami" เฉพาะสำหรับ token ตรวจสอบ — ใช้การเรียก adminList เป็นตัวทดสอบว่า token ยังใช้ได้อยู่
  Api.adminListPersons(adminToken).then(() => {
    enterAdminApp('', '');
  }).catch(() => {
    adminToken = null;
    sessionStorage.removeItem('swdb_admin_token');
  });
})();

// ---------------- MFA (TOTP) setup ----------------
async function loadMfaStatus() {
  document.getElementById('mfaStatusText').textContent = 'สถานะ MFA: จะเปิดใช้งานอัตโนมัติเมื่อยืนยัน OTP ครั้งแรกสำเร็จ (กดปุ่ม "ตั้งค่า MFA" เพื่อเริ่ม)';
}

document.getElementById('mfaSetupBtn').addEventListener('click', async () => {
  try {
    const res = await Api.adminSetupMfa(adminToken);
    document.getElementById('mfaSetupPanel').style.display = '';
    document.getElementById('mfaSecretText').textContent = 'รหัสลับ (กรอกด้วยตนเองหากสแกน QR ไม่ได้): ' + res.secret;
    document.getElementById('mfaQr').innerHTML = '';
    if (window.QRCode) {
      new QRCode(document.getElementById('mfaQr'), { text: res.otpauthUri, width: 160, height: 160 });
    }
  } catch (err) { toast('เริ่มตั้งค่า MFA ไม่สำเร็จ: ' + err.message, 'error'); }
});

document.getElementById('mfaConfirmBtn').addEventListener('click', async () => {
  const otp = document.getElementById('mfaConfirmOtp').value.trim();
  try {
    await Api.adminConfirmMfa(adminToken, otp);
    toast('เปิดใช้งาน MFA สำเร็จ ครั้งต่อไปที่เข้าสู่ระบบด้วยรหัสผ่านจะต้องกรอกรหัส OTP ด้วย');
    document.getElementById('mfaSetupPanel').style.display = 'none';
    document.getElementById('mfaStatusText').textContent = 'สถานะ MFA: เปิดใช้งานแล้ว ✅';
  } catch (err) { toast('รหัส OTP ไม่ถูกต้อง: ' + err.message, 'error'); }
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
  loadDiscipline();
  loadAgencies();
  loadAudit();
}

// ---------------- Dashboard ----------------
async function loadAdminDashboard() {
  try {
    const stats = await Api.stats();
    const nums = document.querySelectorAll('#adminKpi .num');
    nums[0].textContent = stats.total.toLocaleString('th-TH');
    nums[1].textContent = stats.licenseRate + '%';
    nums[2].textContent = stats.expiringLicensesCount.toLocaleString('th-TH');
    nums[3].textContent = stats.disciplineCaseCount.toLocaleString('th-TH');
    document.getElementById('expiringTableBody').innerHTML = stats.expiringLicenses.length
      ? stats.expiringLicenses.map(p => `<tr><td>${escapeHtml(p.PersonID)}</td><td>${escapeHtml(p.Name)}</td><td>${escapeHtml(p.Province)}</td><td>${fmtDate(p.LicenseExpireDate)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="text-soft">ไม่มีใบอนุญาตที่ใกล้หมดอายุ</td></tr>';
  } catch (e) { toast('โหลดข้อมูลภาพรวมไม่สำเร็จ: ' + e.message, 'error'); }
}

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
