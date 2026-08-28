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
    const { person, workHistory, educationHistory } = await Api.personMe(token);
    currentSession = { mode: 'token', token };
    fillProfile(person, workHistory, educationHistory);
    showView('profileView');
  } catch (e) {
    sessionStorage.removeItem('swdb_person_token'); // token หมดอายุหรือไม่ถูกต้อง
  }
})();

// ---------------- "อื่นๆ" -> ช่องกรอกข้อความเพิ่มเติม ----------------
function wireOtherToggle(selectId, otherId) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  select.addEventListener('change', () => {
    other.style.display = (select.value === 'อื่นๆ') ? '' : 'none';
    if (select.value !== 'อื่นๆ') other.value = '';
  });
}
wireOtherToggle('prefixSelect', 'prefixOther');
wireOtherToggle('positionTypeSelect', 'positionTypeOther');
wireOtherToggle('practiceStatusSelect', 'practiceStatusOther');
wireOtherToggle('profPositionTypeSelect', 'profPositionTypeOther');
wireOtherToggle('profPracticeStatusSelect', 'profPracticeStatusOther');

function setSelectWithOther(selectEl, otherEl, value) {
  if (!value) { selectEl.value = ''; otherEl.style.display = 'none'; otherEl.value = ''; return; }
  const known = Array.from(selectEl.options).some(o => o.value === value);
  if (known) { selectEl.value = value; otherEl.style.display = 'none'; otherEl.value = ''; }
  else { selectEl.value = 'อื่นๆ'; otherEl.style.display = ''; otherEl.value = value; }
}

function applyOtherOverrides(data) {
  const prefixOther = document.getElementById('prefixOther').value.trim();
  if (data.Prefix === 'อื่นๆ' && prefixOther) data.Prefix = prefixOther;
  const posOther = document.getElementById('positionTypeOther').value.trim();
  if (data.PositionType === 'อื่นๆ' && posOther) data.PositionType = posOther;
  const practiceOther = document.getElementById('practiceStatusOther').value.trim();
  if (data.PracticeStatus === 'อื่นๆ' && practiceOther) data.PracticeStatus = practiceOther;
  const agencyOther = document.getElementById('agencyNameOther').value.trim();
  if (data.AgencyName === 'อื่นๆ' && agencyOther) data.AgencyName = agencyOther;
  return data;
}

// ---------------- แบบฟอร์มที่ใช้ generic other-toggle สำหรับหน้าโปรไฟล์ (ไอดีมีคำนำหน้า "prof") ----------------
function applyProfileOtherOverrides(data) {
  const posOther = document.getElementById('profPositionTypeOther');
  if (posOther && data.PositionType === 'อื่นๆ' && posOther.value.trim()) data.PositionType = posOther.value.trim();
  const practiceOther = document.getElementById('profPracticeStatusOther');
  if (practiceOther && data.PracticeStatus === 'อื่นๆ' && practiceOther.value.trim()) data.PracticeStatus = practiceOther.value.trim();
  const agencyOther = document.getElementById('profAgencyNameOther');
  if (agencyOther && data.AgencyName === 'อื่นๆ' && agencyOther.value.trim()) data.AgencyName = agencyOther.value.trim();
  return data;
}

// ---------------- สังกัด/หน่วยงาน: cascading dropdown จากไฟล์ "ข้อมูลสังกัด และกรมทั้งหมด" ----------------
// ใช้ข้อมูลจาก js/agency-data.js (27 สังกัด / 186 หน่วยงาน)
function initAgencyDropdowns(root = document) {
  const data = window.AGENCY_DATA;
  const sangkadSel = root.querySelector('.agency-sangkad');
  const deptSel = root.querySelector('.agency-department');
  const typeSel = root.querySelector('.agency-type');
  const otherInput = root.querySelector('.agency-name-other');
  if (!data || !sangkadSel || !deptSel) return;
  if (sangkadSel.dataset.filled) return; // กันเติมตัวเลือกซ้ำ
  sangkadSel.dataset.filled = '1';

  data.sangkad.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name; opt.dataset.agencyType = s.agencyType; opt.textContent = s.name;
    sangkadSel.appendChild(opt);
  });

  sangkadSel.addEventListener('change', () => {
    const sangkad = sangkadSel.value;
    deptSel.innerHTML = '<option value="">เลือกหน่วยงาน</option>';
    if (otherInput) { otherInput.style.display = 'none'; otherInput.value = ''; }
    if (!sangkad) return;
    data.departments.filter(d => d.sangkad === sangkad).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.name; opt.textContent = d.name;
      deptSel.appendChild(opt);
    });
    // เผื่อหน่วยงานย่อยจริงไม่อยู่ในรายการ (เช่น รพ./สำนักงานสาขา) ให้เลือก "อื่นๆ" แล้วพิมพ์เองได้เสมอ
    const otherOpt = document.createElement('option');
    otherOpt.value = 'อื่นๆ'; otherOpt.textContent = 'อื่นๆ (ระบุเอง)';
    deptSel.appendChild(otherOpt);

    const matched = data.sangkad.find(s => s.name === sangkad);
    if (typeSel && matched) typeSel.value = matched.agencyType;
  });

  if (otherInput) {
    deptSel.addEventListener('change', () => {
      otherInput.style.display = (deptSel.value === 'อื่นๆ') ? '' : 'none';
      if (deptSel.value !== 'อื่นๆ') otherInput.value = '';
    });
  }
}
initAgencyDropdowns(document.getElementById('registerForm'));
initAgencyDropdowns(document.getElementById('profileForm'));

function fillAgencyGroup(form, p) {
  const sangkadSel = form.Sangkad, deptSel = form.AgencyName;
  if (!sangkadSel) return;
  const otherInput = form.querySelector('.agency-name-other');
  sangkadSel.value = p.Sangkad || '';
  sangkadSel.dispatchEvent(new Event('change'));
  setTimeout(() => {
    setSelectWithOther(deptSel, otherInput, p.AgencyName || '');
    deptSel.dispatchEvent(new Event('change'));
  }, 0);
}

// ---------------- รายชื่อสถาบันการศึกษา (autocomplete แบบพิมพ์เพิ่มเองได้) ----------------
// แสดงลิสต์ในเครื่อง (window.THAI_UNIVERSITIES) ทันทีก่อนเพื่อความเร็ว แล้วค่อยผสานกับรายชื่อจริงจากฐานข้อมูล
// (ซึ่งจะมีชื่อสถาบันที่ผู้ใช้คนอื่นเคยพิมพ์เพิ่มเองไว้ด้วย — ดู ensureUniversitySaved ฝั่ง backend)
function populateUniversityDatalists(names) {
  document.querySelectorAll('datalist[id^="universityList"]').forEach(dl => {
    const have = new Set(Array.from(dl.options).map(o => o.value));
    names.forEach(name => {
      if (have.has(name)) return;
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
      have.add(name);
    });
  });
}

(function fillUniversityDatalist() {
  populateUniversityDatalists(window.THAI_UNIVERSITIES || []);
  Api.universities().then(({ items }) => populateUniversityDatalists(items || [])).catch(() => {});
})();

// ---------------- ที่อยู่: จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ แบบ cascading dropdown ----------------
// ใช้ข้อมูลจาก js/thai-address-data.js (77 จังหวัด / 928 อำเภอ / 7,436 ตำบล พร้อมรหัสไปรษณีย์)
function initAddressDropdowns(root = document) {
  const data = window.THAI_ADDRESS;
  if (!data) return;

  root.querySelectorAll('.addr-province').forEach(sel => {
    data.provinces.slice().sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name; opt.dataset.code = p.code; opt.textContent = p.name;
      sel.appendChild(opt);
    });
  });

  function districtsFor(provinceCode) { return data.districts.filter(d => d.provinceCode === provinceCode); }
  function subdistrictsFor(districtCode) { return data.subdistricts.filter(s => s.districtCode === districtCode); }

  root.querySelectorAll('.addr-province').forEach(provSel => {
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
initAddressDropdowns(document.getElementById('registerForm'));
initAddressDropdowns(document.getElementById('profileForm'));

// ---------------- "ใช้ที่อยู่เดียวกับทะเบียนบ้าน" ----------------
const currentAddrFields = ['Current_No', 'Current_Village', 'Current_Building', 'Current_Soi', 'Current_Road'];

function copyHouseToCurrentFor(formId) {
  const form = document.getElementById(formId);
  currentAddrFields.forEach(f => { form[f].value = form[f.replace('Current_', 'House_')].value; });
  // คัดลอกจังหวัด/อำเภอ/ตำบล โดยจำลองการเลือกผ่าน dropdown เพื่อให้ตัวเลือกลูกถูกเติมตาม
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
function copyHouseToCurrent() { copyHouseToCurrentFor('registerForm'); }

function wireSameAsHouseCheckbox(formId, checkboxId) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;
  checkbox.addEventListener('change', (e) => {
    const fields = [...currentAddrFields, 'Current_Province', 'Current_District', 'Current_Subdistrict', 'Current_Zipcode'];
    const form = document.getElementById(formId);
    if (e.target.checked) {
      copyHouseToCurrentFor(formId);
      fields.forEach(f => form[f].setAttribute('readonly', 'readonly'));
      form.Current_Province.disabled = false; // select ใช้ readonly ไม่ได้ ต้องล็อกด้วยวิธีอื่น
      ['Current_Province', 'Current_District', 'Current_Subdistrict'].forEach(f => form[f].style.pointerEvents = 'none');
    } else {
      fields.forEach(f => form[f].removeAttribute('readonly'));
      ['Current_Province', 'Current_District', 'Current_Subdistrict'].forEach(f => form[f].style.pointerEvents = '');
    }
  });
  // ถ้าเลือกที่อยู่ทะเบียนบ้านหลังติ๊กถูกไว้แล้ว ให้อัปเดตที่อยู่ปัจจุบันตามไปด้วย
  ['House_Province', 'House_District', 'House_Subdistrict'].forEach(name => {
    document.getElementById(formId)[name].addEventListener('change', () => {
      if (checkbox.checked) setTimeout(() => copyHouseToCurrentFor(formId), 0);
    });
  });
}
wireSameAsHouseCheckbox('registerForm', 'sameAsHouse');
wireSameAsHouseCheckbox('profileForm', 'profSameAsHouse');

// ---------------- ประวัติการทำงาน (หลายช่วงเวลา) ----------------
let workHistoryRowCount = 0;
function addWorkHistoryRow(prefill) {
  const id = 'wh' + (workHistoryRowCount++);
  const wrap = document.createElement('div');
  wrap.className = 'card mt-8';
  wrap.dataset.rowId = id;
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>หน่วยงาน</label><input type="text" class="wh-agency" value="${escapeHtml(prefill && prefill.AgencyName || '')}"></div>
      <div class="field"><label>ตำแหน่ง</label><input type="text" class="wh-position" value="${escapeHtml(prefill && prefill.Position || '')}"></div>
      <div class="field"><label>เริ่มงาน</label><input type="date" class="wh-start" value="${toDateInputValue(prefill && prefill.StartDate)}"></div>
      <div class="field"><label>สิ้นสุด</label><input type="date" class="wh-end" value="${toDateInputValue(prefill && prefill.EndDate)}"></div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('[data-row-id]').remove()">ลบแถวนี้</button>
  `;
  document.getElementById('workHistoryRows').appendChild(wrap);
}
document.getElementById('addWorkHistoryRow').addEventListener('click', () => addWorkHistoryRow());
document.getElementById('addEducationRow').addEventListener('click', () => addEducationRow('educationRows'));
document.getElementById('profAddEducationRow').addEventListener('click', () => addEducationRow('profEducationRows'));
addEducationRow('educationRows'); // เริ่มด้วย 1 แถวว่างให้กรอกได้ทันที

function clearWorkHistoryRows() { document.getElementById('workHistoryRows').innerHTML = ''; }

function collectWorkHistoryEntries() {
  return Array.from(document.querySelectorAll('#workHistoryRows [data-row-id]')).map(row => ({
    AgencyName: row.querySelector('.wh-agency').value.trim(),
    Position: row.querySelector('.wh-position').value.trim(),
    StartDate: row.querySelector('.wh-start').value,
    EndDate: row.querySelector('.wh-end').value
  })).filter(w => w.AgencyName);
}

function toDateInputValue(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

// ---------------- วุฒิการศึกษาแบบเพิ่มได้หลายแถว (ใช้ร่วมกันทั้งฟอร์มลงทะเบียนและฟอร์มแก้ไขข้อมูล) ----------------
let educationRowCount = 0;

function addEducationRow(containerId, prefill) {
  const id = 'edu' + (educationRowCount++);
  const wrap = document.createElement('div');
  wrap.className = 'card mt-8';
  wrap.dataset.rowId = id;
  const level = (prefill && prefill.EducationLevel) || '';
  const levelOptions = ['ปริญญาตรี', 'ปริญญาโท', 'ปริญญาเอก', 'อนุปริญญา/ปวส.'];
  const isOther = level && levelOptions.indexOf(level) === -1;
  const datalistId = containerId === 'educationRows' ? 'universityListReg' : 'universityListProf';
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>ระดับการศึกษา</label>
        <select class="edu-level">
          <option value="">เลือกระดับ</option>
          ${levelOptions.map(o => `<option value="${o}" ${level === o ? 'selected' : ''}>${o}</option>`).join('')}
          <option value="อื่นๆ" ${isOther ? 'selected' : ''}>อื่นๆ</option>
        </select>
        <input type="text" class="edu-level-other" placeholder="โปรดระบุระดับการศึกษา" value="${isOther ? escapeHtml(level) : ''}" style="display:${isOther ? '' : 'none'}; margin-top:8px;">
      </div>
      <div class="field"><label>สาขาวิชา</label><input type="text" class="edu-field" value="${escapeHtml(prefill && prefill.EducationField || '')}"></div>
      <div class="field"><label>สถาบัน</label><input type="text" class="edu-institute" list="${datalistId}" value="${escapeHtml(prefill && prefill.EducationInstitute || '')}" placeholder="พิมพ์ค้นหา หรือระบุชื่อสถาบันใหม่ได้"></div>
      <div class="field"><label>ปีที่จบการศึกษา</label><input type="text" class="edu-year" value="${escapeHtml(prefill && prefill.EducationYear || '')}"></div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="this.closest('[data-row-id]').remove()">ลบวุฒินี้</button>
  `;
  document.getElementById(containerId).appendChild(wrap);
  const levelSel = wrap.querySelector('.edu-level'), levelOther = wrap.querySelector('.edu-level-other');
  levelSel.addEventListener('change', () => {
    levelOther.style.display = (levelSel.value === 'อื่นๆ') ? '' : 'none';
    if (levelSel.value !== 'อื่นๆ') levelOther.value = '';
  });
}

function clearEducationRows(containerId) { document.getElementById(containerId).innerHTML = ''; }

function collectEducationEntries(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} [data-row-id]`)).map(row => {
    const levelSel = row.querySelector('.edu-level'), levelOther = row.querySelector('.edu-level-other');
    const level = (levelSel.value === 'อื่นๆ' && levelOther.value.trim()) ? levelOther.value.trim() : levelSel.value;
    return {
      EducationLevel: level,
      EducationField: row.querySelector('.edu-field').value.trim(),
      EducationInstitute: row.querySelector('.edu-institute').value.trim(),
      EducationYear: row.querySelector('.edu-year').value.trim()
    };
  }).filter(e => e.EducationLevel || e.EducationInstitute || e.EducationField);
}


// ---------------- ดึงข้อมูลจากสภาฯ (สำหรับผู้ที่เคยเป็นสมาชิก/มีข้อมูลอยู่แล้ว) ----------------
let prefillCache = null; // แคชผลลัพธ์ไว้ ไม่ต้องยิง API ซ้ำทุกปุ่มที่กด

async function fetchPrefill() {
  const nationalId = document.getElementById('regNationalId').value.trim();
  if (!/^\d{13}$/.test(nationalId)) {
    toast('กรุณากรอกเลขบัตรประชาชน 13 หลักในข้อ 1 ก่อน', 'error');
    return null;
  }
  if (prefillCache && prefillCache.nationalId === nationalId) return prefillCache.result;
  const result = await Api.prefillLookup(nationalId);
  prefillCache = { nationalId, result };
  return result;
}

const form = () => document.getElementById('registerForm');

function fillAddressGroupFromData(group, p) {
  const f = form();
  const provSel = f[`${group}_Province`], distSel = f[`${group}_District`], subSel = f[`${group}_Subdistrict`], zipInput = f[`${group}_Zipcode`];
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

async function pullFromCouncil(section) {
  const data = await fetchPrefill();
  if (data === null) return;
  if (!data.found) { toast('ไม่พบข้อมูลที่เคยลงทะเบียนไว้กับสภาฯ สำหรับเลขบัตรประชาชนนี้ กรุณากรอกข้อมูลด้วยตนเอง', 'error'); return; }
  const p = data.person, f = form();

  if (section === 'address') {
    ['House_No', 'House_Village', 'House_Building', 'House_Soi', 'House_Road', 'Current_No', 'Current_Village', 'Current_Building', 'Current_Soi', 'Current_Road', 'WorkAddress'].forEach(k => { if (f[k]) f[k].value = p[k] || ''; });
    fillAddressGroupFromData('House', p);
    fillAddressGroupFromData('Current', p);
  } else if (section === 'education') {
    clearEducationRows('educationRows');
    (data.educationHistory && data.educationHistory.length ? data.educationHistory : [p]).forEach(e => {
      if (e.EducationLevel || e.EducationInstitute || e.EducationField) addEducationRow('educationRows', e);
    });
    if (!document.querySelectorAll('#educationRows [data-row-id]').length) addEducationRow('educationRows');
  } else if (section === 'work') {
    setSelectWithOther(document.getElementById('positionTypeSelect'), document.getElementById('positionTypeOther'), p.PositionType || '');
    if (f.PositionLevel) f.PositionLevel.value = p.PositionLevel || '';
    fillAgencyGroup(f, p);
    clearWorkHistoryRows();
    (data.workHistory || []).forEach(w => addWorkHistoryRow(w));
  } else if (section === 'membership') {
    ['MembershipNumber', 'MembershipType'].forEach(k => { f[k].value = p[k] || ''; });
    f.MembershipIssueDate.value = toDateInputValue(p.MembershipIssueDate);
    f.MembershipExpireDate.value = toDateInputValue(p.MembershipExpireDate);
    f.MembershipStatus.value = p.MembershipStatus || 'none';
  } else if (section === 'license') {
    f.LicenseNumber.value = p.LicenseNumber || '';
    f.LicenseIssueDate.value = toDateInputValue(p.LicenseIssueDate);
    f.LicenseExpireDate.value = toDateInputValue(p.LicenseExpireDate);
  } else if (section === 'specialization') {
    f.Specializations.value = p.Specializations || '';
  }
  toast('ดึงข้อมูลจากสภาฯ สำเร็จ กรุณาตรวจสอบความถูกต้องอีกครั้ง');
}

document.querySelectorAll('.pull-council-btn').forEach(btn => {
  btn.addEventListener('click', () => pullFromCouncil(btn.dataset.section));
});

// ---------------- Register ----------------
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const p1 = document.getElementById('regPassword').value;
  const p2 = document.getElementById('regPassword2').value;
  if (p1 !== p2) { alertBox('registerAlert', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'error'); return; }
  if (p1.length < 8) { alertBox('registerAlert', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error'); return; }

  const data = Object.fromEntries(new FormData(form).entries());
  applyOtherOverrides(data);
  data.Province = data.Current_Province || data.House_Province || ''; // ใช้เป็นค่ากลางสำหรับค้นหา/แดชบอร์ดรายจังหวัด
  if (!/^\d{13}$/.test(data.NationalID)) {
    alertBox('registerAlert', 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก', 'error'); return;
  }

  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> กำลังลงทะเบียน...';
  try {
    await Api.register(data, p1, collectWorkHistoryEntries(), collectEducationEntries('educationRows'));
    toast('ลงทะเบียนสำเร็จ กรุณาเข้าสู่ระบบ');
    form.reset();
    clearWorkHistoryRows();
    clearEducationRows('educationRows');
    addEducationRow('educationRows');
    prefillCache = null;
    ['prefixOther', 'positionTypeOther', 'practiceStatusOther'].forEach(id => { document.getElementById(id).style.display = 'none'; });
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
    const { person, workHistory, educationHistory } = await Api.selfLogin(nationalId, password);
    currentSession = { mode: 'password', nationalId, password };
    fillProfile(person, workHistory, educationHistory);
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
function fillProfile(person, workHistory, educationHistory) {
  document.getElementById('profileSubtitle').textContent =
    `${person.Prefix || ''}${person.FirstName} ${person.LastName} · รหัสประจำตัว ${person.PersonID}`;

  document.getElementById('profMembership').textContent = person.MembershipStatus === 'active' ? 'ปกติ' : 'ไม่เป็นสมาชิก';
  document.getElementById('profLicense').textContent = ({
    active: 'ปกติ', expired: 'หมดอายุ', suspended: 'ถูกพักใช้', revoked: 'ถูกเพิกถอน'
  })[person.LicenseStatus] || 'ไม่มี';
  document.getElementById('profLicenseExp').textContent = person.LicenseExpireDate ? fmtDate(person.LicenseExpireDate) : '-';

  const form = document.getElementById('profileForm');
  ['Phone', 'Email', 'WorkAddress', 'Specializations'].forEach(f => { if (form[f]) form[f].value = person[f] || ''; });

  setSelectWithOther(document.getElementById('profPracticeStatusSelect'), document.getElementById('profPracticeStatusOther'), person.PracticeStatus || '');
  setSelectWithOther(document.getElementById('profPositionTypeSelect'), document.getElementById('profPositionTypeOther'), person.PositionType || '');
  if (form.PositionLevel) form.PositionLevel.value = person.PositionLevel || '';
  if (form.AgencyType) form.AgencyType.value = person.AgencyType || 'ภาครัฐ';

  // ที่อยู่ (ทะเบียนบ้าน + ปัจจุบัน) — ไล่เติมจังหวัด→อำเภอ→ตำบล ตามลำดับให้ dropdown ลูกถูกเติมตาม
  ['House', 'Current'].forEach(group => {
    const provSel = form[`${group}_Province`], distSel = form[`${group}_District`], subSel = form[`${group}_Subdistrict`], zipInput = form[`${group}_Zipcode`];
    ['No', 'Village', 'Building', 'Soi', 'Road'].forEach(f => { if (form[`${group}_${f}`]) form[`${group}_${f}`].value = person[`${group}_${f}`] || ''; });
    provSel.value = person[`${group}_Province`] || '';
    provSel.dispatchEvent(new Event('change'));
    setTimeout(() => {
      distSel.value = person[`${group}_District`] || '';
      distSel.dispatchEvent(new Event('change'));
      setTimeout(() => {
        subSel.value = person[`${group}_Subdistrict`] || '';
        subSel.dispatchEvent(new Event('change'));
        zipInput.value = person[`${group}_Zipcode`] || zipInput.value;
      }, 0);
    }, 0);
  });

  // หน่วยงาน (สังกัด → กรม)
  fillAgencyGroupProfile(person);

  // วุฒิการศึกษา (หลายรายการ)
  clearEducationRows('profEducationRows');
  const eduList = (educationHistory && educationHistory.length) ? educationHistory : (person.EducationLevel || person.EducationInstitute ? [person] : []);
  eduList.forEach(e => addEducationRow('profEducationRows', e));
  if (!eduList.length) addEducationRow('profEducationRows');

  const tbody = document.getElementById('workHistoryBody');
  tbody.innerHTML = (workHistory && workHistory.length)
    ? workHistory.map(w => `<tr><td>${escapeHtml(w.AgencyName)}</td><td>${escapeHtml(w.Position)}</td><td>${fmtDate(w.StartDate)}</td><td>${w.EndDate ? fmtDate(w.EndDate) : 'ปัจจุบัน'}</td></tr>`).join('')
    : '<tr><td colspan="4" class="text-soft">ไม่มีข้อมูล</td></tr>';
}

function fillAgencyGroupProfile(p) {
  const form = document.getElementById('profileForm');
  const sangkadSel = form.Sangkad, deptSel = form.AgencyName;
  if (!sangkadSel) return;
  const otherInput = form.querySelector('.agency-name-other');
  sangkadSel.value = p.Sangkad || '';
  sangkadSel.dispatchEvent(new Event('change'));
  setTimeout(() => {
    setSelectWithOther(deptSel, otherInput, p.AgencyName || '');
    deptSel.dispatchEvent(new Event('change'));
  }, 0);
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentSession) { showView('gateView'); return; }
  const data = Object.fromEntries(new FormData(e.target).entries());
  applyProfileOtherOverrides(data);
  data.Province = data.Current_Province || data.House_Province || '';
  const educationEntries = collectEducationEntries('profEducationRows');
  try {
    const { person } = (currentSession.mode === 'token')
      ? await Api.personUpdateProfileToken(currentSession.token, data, educationEntries)
      : await Api.updateProfile(currentSession.nationalId, currentSession.password, data, educationEntries);
    toast('บันทึกข้อมูลสำเร็จ');
    const { items: workHistory } = await Api.workHistory(person.PersonID).catch(() => ({ items: [] }));
    fillProfile(person, workHistory, educationEntries);
  } catch (err) {
    alertBox('profileAlert', 'บันทึกไม่สำเร็จ: ' + err.message, 'error');
  }
});

showView('gateView');
