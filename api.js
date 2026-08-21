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

    register: (data, password) => post('register', { data, password }),
    selfLogin: (nationalId, password) => post('selfLogin', { nationalId, password }),
    updateProfile: (nationalId, password, data) => post('updateProfile', { nationalId, password, data }),

    // ThaiD (ระบบพิสูจน์และยืนยันตัวตนทางดิจิทัลภาครัฐ)
    thaidLoginUrl: (role, returnPath) => get('thaidLoginUrl', { role, returnPath: returnPath || '' }),
    personMe: (token) => get('personMe', { token }),
    personUpdateProfileToken: (token, data) => post('personUpdateProfileToken', { token, data }),

    adminLogin: (username, password, otp) => post('adminLogin', { username, password, otp }),
    adminSetupMfa: (token) => post('adminSetupMfa', { token }),
    adminConfirmMfa: (token, otp) => post('adminConfirmMfa', { token, otp }),
    adminListPersons: (token) => get('adminList', { token }),
    adminGetPerson: (token, personId) => get('adminGetPerson', { token, personId }),
    adminUpsertPerson: (token, data, workHistoryEntry) => post('adminUpsertPerson', { token, data, workHistoryEntry }),
    adminDeletePerson: (token, personId) => post('adminDeletePerson', { token, personId }),
    adminListDiscipline: (token) => get('adminDiscipline', { token }),
    adminUpsertDiscipline: (token, data) => post('adminUpsertDiscipline', { token, data }),
    adminListAudit: (token) => get('adminAudit', { token }),
    adminAgencies: () => get('adminAgencies'),
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
