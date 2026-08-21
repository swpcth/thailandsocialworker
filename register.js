// currentSession: either { mode:'password', nationalId, password } for the legacy username/password flow,
// or { mode:'token', token } for a ThaiD-authenticated session (token persisted in sessionStorage so it
// survives the full-page redirect back from ThaiD/Apps Script).
let currentSession = null;

function showView(id) {
  ['gateView', 'loginView', 'registerView', 'profileView'].forEach(v => {
    document.getElementById(v).style.display = (v === id) ? '' : 'none';
  });
}

function alertBox(elId, msg, type) {
  document.getElementById(elId).innerHTML = `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
}

// ---------------- ThaiD login ----------------
document.getElementById('thaidLoginBtn').addEventListener('click', async () => {
  const btn = document.getElementById('thaidLoginBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-color:#1e3a5f33;border-top-color:#1e3a5f;"></span> กำลังเชื่อมต่อ...';
  try {
    const res = await Api.thaidLoginUrl('citizen');
    if (!res.configured) {
      alertBox('thaidLoginAlert', res.message || 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ ThaiD บนระบบนี้', 'info');
      return;
    }
    window.location.href = res.url; // ไปหน้ายืนยันตัวตนของ ThaiD แล้วจะถูก redirect กลับมาที่ thaid-callback.html
  } catch (err) {
    alertBox('thaidLoginAlert', 'เชื่อมต่อ ThaiD ไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบด้วย ThaiD';
  }
});

// ถ้ามี session token จากการเข้าสู่ระบบด้วย ThaiD ค้างอยู่ (ถูก redirect กลับมาจาก thaid-callback.html) ให้โหลดโปรไฟล์ทันที
(async function restoreThaidSession() {
  const token = sessionStorage.getItem('swdb_person_token');
  if (!token) return;
  try {
    const { person, workHistory } = await Api.personMe(token);
    currentSession = { mode: 'token', token };
    fillProfile(person, workHistory);
    showView('profileView');
  } catch (e) {
    sessionStorage.removeItem('swdb_person_token'); // token หมดอายุหรือไม่ถูกต้อง
  }
})();

// ---------------- Register ----------------
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const p1 = document.getElementById('regPassword').value;
  const p2 = document.getElementById('regPassword2').value;
  if (p1 !== p2) { alertBox('registerAlert', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'error'); return; }
  if (p1.length < 8) { alertBox('registerAlert', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error'); return; }

  const data = Object.fromEntries(new FormData(form).entries());
  if (!/^\d{13}$/.test(data.NationalID)) {
    alertBox('registerAlert', 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก', 'error'); return;
  }

  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังลงทะเบียน...';
  try {
    await Api.register(data, p1);
    toast('ลงทะเบียนสำเร็จ กรุณาเข้าสู่ระบบ');
    form.reset();
    showView('loginView');
  } catch (err) {
    const msg = err.message === 'national_id_already_registered'
      ? 'เลขบัตรประชาชนนี้ลงทะเบียนไว้แล้ว กรุณาเข้าสู่ระบบแทน'
      : 'ลงทะเบียนไม่สำเร็จ: ' + err.message;
    alertBox('registerAlert', msg, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'ลงทะเบียน';
  }
});

// ---------------- Login ----------------
document.getElementById('loginBtn').addEventListener('click', async () => {
  const nationalId = document.getElementById('loginNationalId').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!nationalId || !password) { alertBox('loginAlert', 'กรุณากรอกเลขบัตรประชาชนและรหัสผ่าน', 'error'); return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังเข้าสู่ระบบ...';
  try {
    const { person, workHistory } = await Api.selfLogin(nationalId, password);
    currentSession = { mode: 'password', nationalId, password };
    fillProfile(person, workHistory);
    showView('profileView');
  } catch (err) {
    alertBox('loginAlert', 'เข้าสู่ระบบไม่สำเร็จ: เลขบัตรประชาชนหรือรหัสผ่านไม่ถูกต้อง', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
});

function logout() {
  currentSession = null;
  sessionStorage.removeItem('swdb_person_token');
  document.getElementById('loginNationalId').value = '';
  document.getElementById('loginPassword').value = '';
  showView('gateView');
}

// ---------------- Profile ----------------
function fillProfile(person, workHistory) {
  document.getElementById('profileSubtitle').textContent =
    `${person.Prefix || ''}${person.FirstName} ${person.LastName} · รหัสประจำตัว ${person.PersonID}`;

  document.getElementById('profMembership').textContent = person.MembershipStatus === 'active' ? 'ปกติ' : 'ไม่เป็นสมาชิก';
  document.getElementById('profLicense').textContent = ({
    active: 'ปกติ', expired: 'หมดอายุ', suspended: 'ถูกพักใช้', revoked: 'ถูกเพิกถอน'
  })[person.LicenseStatus] || 'ไม่มี';
  document.getElementById('profLicenseExp').textContent = person.LicenseExpireDate ? fmtDate(person.LicenseExpireDate) : '-';

  const form = document.getElementById('profileForm');
  ['Phone','Email','HouseAddress','CurrentAddress','WorkAddress','Province','EducationLevel','EducationField','EducationInstitute','PositionType','AgencyName','Specializations']
    .forEach(f => { if (form[f]) form[f].value = person[f] || ''; });

  const tbody = document.getElementById('workHistoryBody');
  tbody.innerHTML = (workHistory && workHistory.length)
    ? workHistory.map(w => `<tr><td>${escapeHtml(w.AgencyName)}</td><td>${escapeHtml(w.Position)}</td><td>${fmtDate(w.StartDate)}</td><td>${w.EndDate ? fmtDate(w.EndDate) : 'ปัจจุบัน'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="text-soft">ไม่มีข้อมูล</td></tr>';
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentSession) { showView('gateView'); return; }
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const { person } = (currentSession.mode === 'token')
      ? await Api.personUpdateProfileToken(currentSession.token, data)
      : await Api.updateProfile(currentSession.nationalId, currentSession.password, data);
    toast('บันทึกข้อมูลสำเร็จ');
    fillProfile(person, []);
    Api.workHistory(person.PersonID).then(({ items }) => fillProfile(person, items)).catch(() => {});
  } catch (err) {
    alertBox('profileAlert', 'บันทึกไม่สำเร็จ: ' + err.message, 'error');
  }
});

showView('gateView');
