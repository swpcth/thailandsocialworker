/**
 * ตัวช่วยวาดกราฟที่ใช้ร่วมกันระหว่างหน้าแดชบอร์ดสาธารณะ (index.html) และแดชบอร์ดผู้ดูแลระบบ (admin.html)
 * ต้องโหลดไฟล์นี้หลังจาก <script src=".../chart.umd.min.js"> ใน head (หรือจะโหลดก่อนก็ได้ เพราะมีการโหลดซ้ำแบบ defensive อยู่แล้ว)
 */
const CHART_COLORS = ['#1e3a5f', '#a4231f', '#b8862e', '#1f7a4d', '#5a6472', '#2a4d78', '#c0392b', '#8a6d3b'];

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

function renderBar(ctx, labels, data, opts = {}) {
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: opts.color || '#1e3a5f' }] },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { font: { family: 'Sarabun' } } }, y: { beginAtZero: true } }
    }
  });
}

function renderLine(ctx, labels, data, opts = {}) {
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: opts.color || '#a4231f', backgroundColor: (opts.color || '#a4231f') + '22', fill: true, tension: 0.3 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { font: { family: 'Sarabun' } } }, y: { beginAtZero: true } }
    }
  });
}

function showChartFallback(canvasEl, message) {
  if (!canvasEl) return;
  const note = document.createElement('p');
  note.className = 'text-sm text-soft';
  note.textContent = message;
  canvasEl.replaceWith(note);
}

// เรียก render() ของแต่ละกราฟแบบปลอดภัย — ถ้า Chart.js โหลดไม่ได้ จะแสดงข้อความแทนที่ ไม่ทำให้ทั้งหน้าใช้งานไม่ได้
async function renderChartsSafely(chartDefs) {
  const chartOk = await ensureChartLoaded();
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

// โหลดไลบรารี SheetJS (XLSX) แบบไดนามิกพร้อม CDN สำรอง — ใช้รูปแบบเดียวกับ ensureChartLoaded ด้านบน
function ensureXlsxLoaded(timeoutMs = 6000) {
  if (window.XLSX) return Promise.resolve(true);
  const sources = [
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
  ];
  function tryLoad(i) {
    if (window.XLSX) return Promise.resolve(true);
    if (i >= sources.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = sources[i];
      const timer = setTimeout(() => resolve(false), timeoutMs);
      script.onload = () => { clearTimeout(timer); resolve(true); };
      script.onerror = () => { clearTimeout(timer); resolve(false); };
      document.head.appendChild(script);
    }).then(ok => (ok && window.XLSX) ? true : tryLoad(i + 1));
  }
  return tryLoad(0);
}
