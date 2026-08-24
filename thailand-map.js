/**
 * แผนที่ประเทศไทยแบบโต้ตอบได้ (interactive choropleth map) — ใช้ร่วมกันระหว่างหน้าแดชบอร์ดสาธารณะและผู้ดูแลระบบ
 * ใช้ D3.js วาดขอบเขตจังหวัดจากไฟล์ thailand-provinces.geo.json (ต้องอยู่ตำแหน่งเดียวกับหน้า HTML ที่เรียกใช้)
 * ข้อมูลขอบเขต: ดัดแปลงจาก apisit/thailand.json (MIT License) จับคู่ชื่อจังหวัดภาษาไทยแล้ว
 */

function ensureD3Loaded(timeoutMs = 6000) {
  if (window.d3) return Promise.resolve(true);
  const sources = [
    'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
    'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'
  ];
  function tryLoad(i) {
    if (window.d3) return Promise.resolve(true);
    if (i >= sources.length) return Promise.resolve(false);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = sources[i];
      const timer = setTimeout(() => resolve(false), timeoutMs);
      script.onload = () => { clearTimeout(timer); resolve(true); };
      script.onerror = () => { clearTimeout(timer); resolve(false); };
      document.head.appendChild(script);
    }).then(ok => (ok && window.d3) ? true : tryLoad(i + 1));
  }
  return tryLoad(0);
}

let _geoCache = null;
async function loadThailandGeo() {
  if (_geoCache) return _geoCache;
  const res = await fetch('thailand-provinces.geo.json');
  _geoCache = await res.json();
  return _geoCache;
}

function mapColorScale(value, max) {
  if (!max || max <= 0 || !value) return '#e7edf3';
  const t = Math.min(1, Math.sqrt(value / max)); // sqrt scale กันจังหวัดค่าน้อยกลืนหายไปหมด
  const c0 = [219, 230, 240], c1 = [18, 37, 61];
  const rgb = c0.map((c, i) => Math.round(c + (c1[i] - c) * t));
  return `rgb(${rgb.join(',')})`;
}

/**
 * วาดแผนที่ลงใน container
 * @param {string} containerId - id ของ div ที่จะวาดแผนที่ลงไป
 * @param {Object} dataByProvince - { "ชื่อจังหวัด": จำนวน }
 * @param {Object} opts - { height, onProvinceClick(name, count) }
 */
async function renderThailandMap(containerId, dataByProvince, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<p class="text-sm text-soft">กำลังโหลดแผนที่...</p>';

  const d3ok = await ensureD3Loaded();
  if (!d3ok) {
    container.innerHTML = '<p class="text-sm text-soft">ไม่สามารถโหลดไลบรารีแผนที่ได้ในขณะนี้ (เครือข่ายอาจบล็อก CDN) — ใช้ตารางด้านล่างแทนได้</p>';
    return;
  }

  let geo;
  try {
    geo = await loadThailandGeo();
  } catch (e) {
    container.innerHTML = '<p class="text-sm text-soft">ไม่สามารถโหลดข้อมูลขอบเขตจังหวัดได้</p>';
    return;
  }

  container.innerHTML = '';
  container.style.position = 'relative';
  const width = container.clientWidth || 360;
  const height = opts.height || 520;

  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', '100%').attr('height', height)
    .style('display', 'block');

  const projection = d3.geoMercator().fitSize([width, height], geo);
  const path = d3.geoPath().projection(projection);
  const max = Math.max(1, ...Object.values(dataByProvince).map(Number));

  const tooltip = d3.select(container).append('div')
    .style('position', 'absolute').style('pointer-events', 'none')
    .style('background', '#12253d').style('color', '#fff')
    .style('padding', '6px 10px').style('border-radius', '4px')
    .style('font-size', '12px').style('opacity', 0).style('z-index', 5)
    .style('font-family', 'Sarabun, sans-serif');

  svg.selectAll('path')
    .data(geo.features)
    .join('path')
    .attr('d', path)
    .attr('fill', d => mapColorScale(dataByProvince[d.properties.name_th] || 0, max))
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 0.6)
    .style('cursor', opts.onProvinceClick ? 'pointer' : 'default')
    .on('mousemove', function (event, d) {
      const name = d.properties.name_th;
      const count = dataByProvince[name] || 0;
      tooltip.style('opacity', 1)
        .html(`<strong>${name}</strong><br>${count.toLocaleString('th-TH')} คน`)
        .style('left', (event.offsetX + 12) + 'px')
        .style('top', (event.offsetY + 8) + 'px');
      d3.select(this).attr('stroke', '#a4231f').attr('stroke-width', 1.6);
    })
    .on('mouseleave', function () {
      tooltip.style('opacity', 0);
      d3.select(this).attr('stroke', '#ffffff').attr('stroke-width', 0.6);
    })
    .on('click', function (event, d) {
      const name = d.properties.name_th;
      if (opts.onProvinceClick) opts.onProvinceClick(name, dataByProvince[name] || 0);
    });
}
