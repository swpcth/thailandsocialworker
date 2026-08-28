/**
 * ตัวเชื่อมต่อ API ไปยัง Google Apps Script Web App
 *
 * *** สำคัญ: ต้องแก้ค่า API_URL ด้านล่างให้เป็น URL ของ Web App ที่ deploy จาก Code.gs ***
 * ดูวิธี deploy ได้ใน README.md (โฟลเดอร์ apps-script)
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbxByRzS9Bvj-E7tgGxLp1rWWsNLmCXBIGpqj7LVIwIwbYoAIzQN6_PcZMzXePmKIVdO/exec';

const Api = (() => {
  function withParams(action, params) {
    const usp = new URLSearchParams(Object.assign({ action }, params || {}));
    return `${API_URL}?${usp.toString()}`;
  }

  async function get(action, params) {
    if (!API_URL || API_URL.indexOf('PASTE_YOUR') === 0) {
      throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน js/api.js — โปรดใส่ URL ของ Apps Script Web App');
    }
    const res = await fetch(withParams(action, params), { method: 'GET' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ส่งเป็น text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script (เทคนิคมาตรฐานสำหรับ Apps Script Web App)
  async function post(action, payload) {
    if (!API_URL || API_URL.indexOf('PASTE_YOUR') === 0) {
      throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน js/api.js — โปรดใส่ URL ของ Apps Script Web App');
    }
    const body = JSON.stringify(Object.assign({ action }, payload || {}));
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    search: (q) => get('search', { q }),
    stats: () => get('stats'),
    provinces: () => get('provinces'),
    courses: (q) => get('courses', { q }),
    workHistory: (personId) => get('workHistory', { personId }),

    register: (data, password, workHistoryEntries, educationEntries) => post('register', { data, password, workHistoryEntries, educationEntries }),
    selfLogin: (nationalId, password) => post('selfLogin', { nationalId, password }),
    updateProfile: (nationalId, password, data, educationEntries) => post('updateProfile', { nationalId, password, data, educationEntries }),
    prefillLookup: (nationalId) => get('prefillLookup', { nationalId }),

    // ThaiD (ระบบพิสูจน์และยืนยันตัวตนทางดิจิทัลภาครัฐ)
    thaidLoginUrl: (role, returnPath) => get('thaidLoginUrl', { role, returnPath: returnPath || '' }),
    personMe: (token) => get('personMe', { token }),
    personUpdateProfileToken: (token, data, educationEntries) => post('personUpdateProfileToken', { token, data, educationEntries }),

    adminLogin: (username, password) => post('adminLogin', { username, password }),
    adminVerifyLoginOtp: (username, otp) => post('adminVerifyLoginOtp', { username, otp }),
    adminSetupMfa: (token, email) => post('adminSetupMfa', { token, email }),
    adminConfirmMfa: (token, otp) => post('adminConfirmMfa', { token, otp }),
    adminListPersons: (token) => get('adminList', { token }),
    adminWhoami: (token) => get('adminWhoami', { token }),
    adminGetPerson: (token, personId) => get('adminGetPerson', { token, personId }),
    adminUpsertPerson: (token, data, workHistoryEntry) => post('adminUpsertPerson', { token, data, workHistoryEntry }),
    adminBulkImportPersons: (token, records) => post('adminBulkImportPersons', { token, records }),
    adminDeletePerson: (token, personId) => post('adminDeletePerson', { token, personId }),
    adminListDiscipline: (token) => get('adminDiscipline', { token }),
    adminUpsertDiscipline: (token, data) => post('adminUpsertDiscipline', { token, data }),
    adminListAudit: (token) => get('adminAudit', { token }),
    adminAgencies: () => get('adminAgencies'),
    adminAllEducation: (token) => get('adminAllEducation', { token }),
    universities: () => get('universities'),
    adminUpsertAgency: (token, data) => post('adminUpsertAgency', { token, data }),
    adminUpsertCourse: (token, data) => post('adminUpsertCourse', { token, data }),
    adminDeleteCourse: (token, courseId) => post('adminDeleteCourse', { token, courseId }),
  };
})();

function toast(msg, type) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'error' ? 'err' : 'ok');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
  if (!d) return '-';
  try {
    const date = new Date(d);
    if (isNaN(date)) return String(d);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { return String(d); }
}

// ========================= ที่อยู่: จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ (ใช้ร่วมกันหลายหน้า) =========================
// ต้องโหลด js/thai-address-data.js ก่อนไฟล์นี้ (77 จังหวัด / 928 อำเภอ / 7,436 ตำบล พร้อมรหัสไปรษณีย์)

function initAddressDropdowns(root = document) {
  const data = window.THAI_ADDRESS;
  if (!data) return;

  root.querySelectorAll('.addr-province').forEach(sel => {
    if (sel.dataset.filled) return; // กันเติมซ้ำถ้าเรียกฟังก์ชันนี้มากกว่าหนึ่งครั้งกับ root เดิม
    sel.dataset.filled = '1';
    data.provinces.slice().sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name; opt.dataset.code = p.code; opt.textContent = p.name;
      sel.appendChild(opt);
    });
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

// เลือก option ของ dropdown ที่อยู่ตาม "ชื่อ" (ใช้ตอนเติมข้อมูลเดิมของบุคคลลงฟอร์มแก้ไข) แล้วยิง change event
// ต่อเนื่องกันเพื่อให้ dropdown ลูก (อำเภอ/ตำบล) ถูกเติมและเลือกค่าตามลำดับ
function setAddressGroupValues(form, group, values) {
  const provSel = form[`${group}_Province`], distSel = form[`${group}_District`], subSel = form[`${group}_Subdistrict`], zipInput = form[`${group}_Zipcode`];
  provSel.value = values.province || '';
  provSel.dispatchEvent(new Event('change'));
  setTimeout(() => {
    distSel.value = values.district || '';
    distSel.dispatchEvent(new Event('change'));
    setTimeout(() => {
      subSel.value = values.subdistrict || '';
      subSel.dispatchEvent(new Event('change'));
      if (values.zipcode) zipInput.value = values.zipcode;
    }, 0);
  }, 0);
}

// ผูก checkbox "ใช้ที่อยู่เดียวกับทะเบียนบ้าน" เข้ากับฟอร์มใดก็ได้ที่มีฟิลด์ House_*/Current_* ครบ
function wireSameAsHouse(formId, checkboxId) {
  const form = document.getElementById(formId);
  const checkbox = document.getElementById(checkboxId);
  if (!form || !checkbox) return;
  const simpleFields = ['No', 'Village', 'Building', 'Soi', 'Road'];

  function copy() {
    simpleFields.forEach(f => { form[`Current_${f}`].value = form[`House_${f}`].value; });
    setAddressGroupValues(form, 'Current', {
      province: form.House_Province.value, district: form.House_District.value,
      subdistrict: form.House_Subdistrict.value, zipcode: form.House_Zipcode.value
    });
  }

  checkbox.addEventListener('change', (e) => {
    const lockFields = [...simpleFields.map(f => `Current_${f}`), 'Current_Zipcode'];
    if (e.target.checked) {
      copy();
      lockFields.forEach(f => form[f].setAttribute('readonly', 'readonly'));
      ['Current_Province', 'Current_District', 'Current_Subdistrict'].forEach(f => form[f].style.pointerEvents = 'none');
    } else {
      lockFields.forEach(f => form[f].removeAttribute('readonly'));
      ['Current_Province', 'Current_District', 'Current_Subdistrict'].forEach(f => form[f].style.pointerEvents = '');
    }
  });

  ['House_Province', 'House_District', 'House_Subdistrict'].forEach(name => {
    form[name].addEventListener('change', () => { if (checkbox.checked) setTimeout(copy, 0); });
  });
}

// ========================= "อื่นๆ" -> ช่องกรอกข้อความเพิ่มเติม (ใช้ร่วมกันหลายหน้า) =========================

function wireOtherToggle(selectId, otherId) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  if (!select || !other) return;
  select.addEventListener('change', () => {
    other.style.display = (select.value === 'อื่นๆ') ? '' : 'none';
    if (select.value !== 'อื่นๆ') other.value = '';
  });
}

function applyOtherOverride(data, selectId, otherId, fieldName) {
  const otherVal = document.getElementById(otherId).value.trim();
  if (data[fieldName] === 'อื่นๆ' && otherVal) data[fieldName] = otherVal;
  return data;
}
