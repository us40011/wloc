export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(getHtmlPage(), {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    if (url.pathname === "/api/parse") {
      const u = url.searchParams.get("u") || "";
      const cs = (url.searchParams.get("cs") || "").toLowerCase();
      const format = (url.searchParams.get("format") || "").toLowerCase();

      try {
        let coord = await parseCoords(u);
        let lat = coord.lat;
        let lon = coord.lon;
        let name = coord.name || "";
        let src = coord.src || "";

        if (cs === "gcj" || (cs !== "none" && (src === "amap" || src === "apple"))) {
          let wgs = gcj02ToWgs84(lat, lon);
          lat = wgs.lat;
          lon = wgs.lon;
        }

        lat = Math.round(lat * 1e6) / 1e6;
        lon = Math.round(lon * 1e6) / 1e6;

        const headers = { "Access-Control-Allow-Origin": "*" };
        if (format === "json") {
          return new Response(JSON.stringify({ lat, lon, name }), {
            headers: { "Content-Type": "application/json", ...headers }
          });
        }
        return new Response(`lat=${lat}&lon=${lon}`, { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || String(err) }), {
          status: 422,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return new Response("404 Not Found", { status: 404 });
  }
};const J = 6378245.0, Q = 0.006693421622965943;function outOfChina(lat, lon) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
  return ret;
}function transformLon(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
  return ret;
}function gcj02ToWgs84(lat, lon) {
  if (outOfChina(lat, lon)) return { lat, lon };
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  let radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - Q * magic * magic;
  let sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((J * (1 - Q)) / (magic * sqrtMagic) * Math.PI);
  dLon = (dLon * 180.0) / (J / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { lat: lat - dLat, lon: lon - dLon };
}function extractFromString(text) {
  if (!text) return null;
  let str = String(text), m;
  if ((m = str.match(/(?:coordinate|ll|sll)=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i))) {
    let nameMatch = str.match(/[?&]name=([^&]+)/i);
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), name: nameMatch ? decodeURIComponent(nameMatch[1]) : "", src: "apple" };
  }
  if ((m = str.match(/[?&]p=[^,&%]*(?:,|%2C)(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i))) {
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), name: "", src: "amap" };
  }
  if ((m = str.match(/[?&]q=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i))) {
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), name: "", src: "amap" };
  }
  if ((m = str.match(/(-?\d{1,3}\.\d{4,})\s*(?:,|%2C)\s*(-?\d{1,3}\.\d{4,})/))) {
    return { lat: parseFloat(m[1]), lon: parseFloat(m[2]), name: "", src: "text" };
  }
  return null;
}

async function parseCoords(inputStr) {
  let text = String(inputStr || "").trim();
  if (!text) throw new Error("输入为空");
  let urlMatch = text.match(/https?:\/\/[^\s'"<>]+/i);
  let targetUrl = urlMatch ? urlMatch[0] : text;
  let res = extractFromString(targetUrl);
  if (res) return res;

  if (urlMatch) {
    let curUrl = targetUrl;
    for (let i = 0; i < 5; i++) {
      try {
        let resp = await fetch(curUrl, {
          redirect: "manual",
          headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15" }
        });
        let loc = resp.headers.get("location");
        if (loc) {
          if ((res = extractFromString(loc))) return res;
          curUrl = new URL(loc, curUrl).toString();
          if ((res = extractFromString(curUrl))) return res;
          continue;
        }
        if ((res = extractFromString(resp.url))) return res;
        let html = await resp.text();
        if ((res = extractFromString(html))) return res;
        break;
      } catch { break; }
    }
  }
  throw new Error("未能从链接中解析出经纬度");
}function getHtmlPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>WLOC 虚拟定位</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
:root { --blue:#007aff; --green:#34c759; --red:#ff3b30; --gray:#8e8e93; --bg:#f2f2f7; --tg:#229ED9; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,system-ui,sans-serif; background:var(--bg); color:#333; }
#map { height:50vh; width:100%; min-height:250px; }
.panel { padding:16px; max-width:600px; margin:0 auto 30px auto; }
.card { background:#fff; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
.card h3 { font-size:15px; font-weight:600; margin-bottom:10px; }
.coords { font-family:monospace; font-size:14px; color:#333; padding:8px 12px; background:var(--bg); border-radius:8px; word-break:break-all; }
.row { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
.btn { flex:1; min-width:100px; padding:12px 16px; border:none; border-radius:10px; font-size:14px; font-weight:500; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; text-align:center; color:#fff; }
.btn-primary { background:var(--blue); }
.btn-secondary { background:#e5e5ea; color:#333; }
.btn-danger { background:var(--red); }
.btn-tg { background:var(--tg); }
.btn.success { background:var(--green); }
.btn-sm { flex:none; min-width:auto; padding:6px 12px; font-size:12px; border-radius:8px; }
.section-title { font-size:14px; font-weight:600; color:#1c1c1e; margin:16px 0 8px 0; display:flex; align-items:center; gap:6px; }
.input-row { display:flex; gap:8px; margin-top:10px; }
.input-row input { flex:1; padding:10px 12px; border:1px solid #d1d1d6; border-radius:8px; font-size:14px; outline:none; }
.status { font-size:12px; color:var(--gray); margin-top:8px; text-align:center; }
.toast { position:fixed; top:60px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; }
.toast.show { opacity:1; }
.layer-switch { position:absolute; top:10px; right:10px; z-index:1000; display:flex; gap:4px; background:rgba(255,255,255,.92); border-radius:8px; padding:4px; box-shadow:0 2px 8px rgba(0,0,0,.15); }
.layer-btn { border:none; background:transparent; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; color:#333; font-weight:500; }
.layer-btn.active { background:var(--blue); color:#fff; }
.active-loc { background:var(--bg); border-radius:8px; padding:10px 12px; font-size:13px; color:#333; margin-top:8px; }
.active-loc .label { font-size:11px; color:var(--gray); margin-bottom:4px; }
.active-loc .value { font-family:monospace; font-size:13px; }
.fav-list { max-height:240px; overflow-y:auto; }
.fav-item { display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--bg); border-radius:8px; margin-bottom:6px; cursor:pointer; }
.fav-item .fav-info { flex:1; min-width:0; }
.fav-item .fav-name { font-size:14px; font-weight:500; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fav-item .fav-coords { font-size:11px; color:#8e8e93; font-family:monospace; margin-top:2px; }
.fav-item .fav-del { flex:none; width:28px; height:28px; border:none; border-radius:50%; background:transparent; color:var(--red); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.fav-empty { text-align:center; color:var(--gray); font-size:13px; padding:16px 0; }
.fav-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.4); z-index:10000; display:none; align-items:center; justify-content:center; padding:20px; }
.modal-overlay.show { display:flex; }
.modal { background:#fff; border-radius:16px; padding:20px; width:100%; max-width:340px; }
.modal h3 { font-size:17px; font-weight:600; margin-bottom:16px; text-align:center; }
.modal input { width:100%; padding:12px; border:1px solid #d1d1d6; border-radius:10px; font-size:15px; outline:none; margin-bottom:12px; }
.footer-card { text-align:center; padding:24px 16px; background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); margin-top:16px; }

/* 调整后的 Logo 样式（和英文版一致放大到 96px） */
.footer-logo {
  width: 96px;
  height: 96px;
  border-radius: 20px;
  margin: 0 auto 12px auto;
  object-fit: contain;
  background: #000;
  box-shadow: 0 4px 16px rgba(0, 122, 255, 0.25);
  display: block;
}
</style>
</head>
<body>
<div style="position:relative">
<div id="map"></div>
<div class="layer-switch">
  <button class="layer-btn active" data-layer="satellite" onclick="switchLayer('satellite')">卫星</button>
  <button class="layer-btn" data-layer="wgs84" onclick="switchLayer('wgs84')">WGS84</button>
  <button class="layer-btn" data-layer="amap" onclick="switchLayer('amap')">高德</button>
  <button class="layer-btn" data-layer="voyager" onclick="switchLayer('voyager')">彩色</button>
  <button class="layer-btn" data-layer="standard" onclick="switchLayer('standard')">标准</button>
  <button class="layer-btn" data-layer="dark" onclick="switchLayer('dark')">暗色</button>
</div>
</div>
<div class="panel">
  <div class="card">
    <h3>选择目标位置</h3>
    <div class="coords" id="coords">经度 -0.127800  纬度 51.507900</div>
    <div class="row">
      <button class="btn btn-primary" id="saveBtn" onclick="save()">储存到设备</button>
      <button class="btn btn-secondary" onclick="addFav()">收藏位置</button>
      <button class="btn btn-secondary" onclick="locateMe()">当前位置</button>
    </div>

    <div class="section-title">环境安装</div>
    <div class="row">
      <button class="btn btn-primary" onclick="copyText('https://raw.githubusercontent.com/us40011/wloc/main/modules/wloc.module')">模块安装</button>
      <a class="btn btn-primary" href="https://www.icloud.com/shortcuts/2a811c3bac0e4694b1875ae45b26ab0d" target="_blank">IOS定位键</a>
      <a class="btn btn-primary" href="https://www.icloud.com/shortcuts/9092b1a576cf4b7c8bc0dd931ba512a6" target="_blank">IOS恢复键</a>
    </div>
  </div>

  <div class="card">
    <div class="fav-header">
      <h3>收藏的位置</h3>
      <button class="btn btn-sm btn-secondary" onclick="clearAllFav()" id="clearAllBtn" style="display:none">清空全部</button>
    </div>
    <div id="favList" class="fav-list"></div>
  </div>

  <div class="card">
    <h3>当前生效坐标</h3>
    <div class="active-loc" id="activeLoc">
      <div class="label">设备持久化数据</div>
      <div class="value" id="activeValue">查询中...</div>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn btn-sm btn-secondary" onclick="queryActive()">刷新</button>
      <button class="btn btn-sm btn-danger" onclick="clearActive()">清除数据</button>
    </div>
  </div>

  <div class="card">
    <h3>粘贴地图链接</h3>
    <div class="input-row">
      <input id="urlInput" placeholder="Apple/Google/高德地图链接 或 经纬度" />
      <button class="btn btn-secondary" style="flex:none;min-width:56px" onclick="parseUrl()">解析</button>
    </div>
  </div>

  <div class="card">
    <h3>搜索地点</h3>
    <div class="input-row">
      <input id="searchInput" placeholder="输入地名（如: 美国纽约）" />
      <button class="btn btn-secondary" style="flex:none;min-width:56px" onclick="searchPlace()">搜索</button>
    </div>
  </div>

  <div class="footer-card">
    <!-- 图标和降级占位块均已调整为 96px 匹配英文版 -->
    <img class="footer-logo" id="footerLogo" src="https://raw.githubusercontent.com/hankinsus/wloc/refs/heads/main/wloc.jpg" alt="Logo" onerror="this.onerror=null; this.style.display='none'; document.getElementById('fallbackLogo').style.display='flex';">
    <div id="fallbackLogo" style="display:none; width:96px; height:96px; border-radius:20px; margin:0 auto 12px auto; background:linear-gradient(135deg, #007aff, #5856d6); box-shadow:0 4px 16px rgba(0, 122, 255, 0.25); align-items:center; justify-content:center;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </div>
    <div class="footer-brand" style="font-weight:600;font-size:15px;color:#1c1c1e;margin-bottom:4px">我爱研究 ILovestudy</div>
    <div class="footer-version" style="font-size:12px;color:var(--gray);margin-bottom:14px;font-family:monospace;font-weight:700;">v1.1.9</div>
    <a class="btn btn-tg" href="https://t.me/+ySKmeLUxaAM5NGFk" target="_blank">✈️ 加入 Telegram 交流群</a>
  </div>

  <div class="status" id="status">选好位置后点击「储存到设备」写入代理工具</div>
</div>

<div class="toast" id="toast"></div>

<div class="modal-overlay" id="favModal">
  <div class="modal">
    <h3>收藏此位置</h3>
    <input id="favNameInput" placeholder="输入备注名称（如: 公司、家）" maxlength="30" />
    <div style="font-size:12px;color:var(--gray);margin-bottom:12px;text-align:center" id="favModalCoords"></div>
    <div class="row">
      <button class="btn btn-secondary" onclick="closeFavModal()">取消</button>
      <button class="btn btn-primary" onclick="confirmFav()">保存</button>
    </div>
  </div>
</div>

<script>
const SAVE_API = 'https://gs-loc.apple.com/wloc-settings/save';
const FAV_KEY = 'wloc_favorites';
let lat = 51.5079, lon = -0.1278;
let selected = true;
let activeLon = null, activeLat = null;

const map = L.map('map').setView([lat, lon], 13);
const tiles = {
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, attribution:'ArcGIS'}),
  wgs84: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, attribution:'ArcGIS'}),
  standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'OSM'}),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {maxZoom:19, attribution:'Carto'}),
  amap: L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {maxZoom:18, subdomains:'1234', attribution:'高德'}),
  voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {maxZoom:19, attribution:'Carto'})
};
let currentLayer = tiles.satellite;
currentLayer.addTo(map);

function switchLayer(name) {
  map.removeLayer(currentLayer);
  currentLayer = tiles[name];
  currentLayer.addTo(map);
  document.querySelectorAll('.layer-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === name));
}

let marker = L.marker([lat, lon], {draggable:true}).addTo(map);
marker.on('dragend', e => { const p=e.target.getLatLng(); setPos(p.lat, p.lng); });
map.on('click', e => { setPos(e.latlng.lat, e.latlng.lng); });

function setPos(newLat, newLon) {
  lat = newLat; lon = newLon; selected = true;
  marker.setLatLng([lat, lon]);
  document.getElementById('coords').textContent = '经度 ' + lon.toFixed(6) + '  纬度 ' + lat.toFixed(6);
}

function moveTo(newLat, newLon, zoom) {
  setPos(newLat, newLon);
  map.setView([lat, lon], zoom || 15);
}

function toast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms || 2500);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      toast('链接已下载');
    }).catch(() => {
      fallbackCopyText(text);
    });
  } else {
    fallbackCopyText(text);
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    toast('链接已下载');
  } catch (err) {
    toast('下载失败，请手动长按下载');
  }
  document.body.removeChild(textArea);
}

/* 收藏功能 */
function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch(e) { return []; }
}
function saveFavs(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}
function renderFavs() {
  const favs = getFavs();
  const el = document.getElementById('favList');
  const clearBtn = document.getElementById('clearAllBtn');
  clearBtn.style.display = favs.length ? '' : 'none';
  if (!favs.length) {
    el.innerHTML = '<div class="fav-empty">暂无收藏，选好位置后点击「收藏位置」</div>';
    return;
  }
  el.innerHTML = favs.map((f, i) => {
    return '<div class="fav-item" onclick="loadFav(' + i + ')">' +
      '<div class="fav-info">' +
        '<div class="fav-name">' + escHtml(f.name) + '</div>' +
        '<div class="fav-coords">' + f.lon.toFixed(6) + ', ' + f.lat.toFixed(6) + '</div>' +
      '</div>' +
      '<button class="fav-del" onclick="event.stopPropagation();delFav(' + i + ')" title="删除">×</button>' +
    '</div>';
  }).join('');
}
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function addFav() {
  if (!selected) { toast('请先在地图上选择一个位置'); return; }
  document.getElementById('favModalCoords').textContent = lon.toFixed(6) + ', ' + lat.toFixed(6);
  document.getElementById('favNameInput').value = '';
  document.getElementById('favModal').classList.add('show');
  setTimeout(() => document.getElementById('favNameInput').focus(), 100);
}
function closeFavModal() {
  document.getElementById('favModal').classList.remove('show');
}
function confirmFav() {
  const name = document.getElementById('favNameInput').value.trim();
  if (!name) { toast('请输入备注名称'); return; }
  const favs = getFavs();
  favs.push({ name, lon, lat, time: new Date().toISOString() });
  saveFavs(favs);
  closeFavModal();
  renderFavs();
  toast('已收藏: ' + name);
}
function loadFav(i) {
  const favs = getFavs();
  if (!favs[i]) return;
  moveTo(favs[i].lat, favs[i].lon, 15);
  toast(favs[i].name + ' (' + favs[i].lon.toFixed(4) + ', ' + favs[i].lat.toFixed(4) + ')');
}
function delFav(i) {
  const favs = getFavs();
  if (!favs[i]) return;
  const name = favs[i].name;
  favs.splice(i, 1);
  saveFavs(favs);
  renderFavs();
  toast('已删除: ' + name);
}
function clearAllFav() {
  if (!confirm('确定清空所有收藏？')) return;
  saveFavs([]);
  renderFavs();
  toast('已清空所有收藏');
}

/* 生效坐标查询 */
function queryActive() {
  const el = document.getElementById('activeValue');
  el.textContent = '查询中...';
  fetch(SAVE_API + '?action=query', { method:'GET', mode:'cors', cache:'no-store' })
    .then(r => r.json())
    .then(d => {
      if (d.success && d.longitude && d.latitude) {
        activeLon = parseFloat(d.longitude);
        activeLat = parseFloat(d.latitude);
        el.textContent = '经度 ' + activeLon.toFixed(6) + '  纬度 ' + activeLat.toFixed(6) + (d.accuracy ? '  精度 ' + d.accuracy + 'm' : '');
      } else {
        el.textContent = '无已保存的坐标';
      }
    })
    .catch(() => { el.textContent = '查询失败 (需要代理模块支持)'; });
}
function clearActive() {
  if (!confirm('确定清除设备上已保存的坐标？')) return;
  fetch(SAVE_API + '?action=clear', { method:'GET', mode:'cors', cache:'no-store' })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        document.getElementById('activeValue').textContent = '已清除';
        toast('已清除设备坐标');
      } else { toast('清除失败'); }
    })
    .catch(() => { toast('清除失败 - 请检查模块配置'); });
}

/* 储存 */
async function save() {
  if (!selected) { toast('请先在地图上选择一个位置'); return; }
  const btn = document.getElementById('saveBtn');
  btn.textContent = '储存中...'; btn.disabled = true;
  try {
    const r = await fetch(SAVE_API + '?lon=' + lon + '&lat=' + lat + '&acc=25', { method: 'GET', mode: 'cors', cache: 'no-store' });
    const d = await r.json();
    if (d.success) {
      btn.textContent = '✓ 已储存'; btn.className = 'btn btn-primary success';
      toast('✓ 坐标已写入设备');
      setTimeout(() => { btn.textContent='储存到设备'; btn.className='btn btn-primary'; btn.disabled=false; }, 2500);
      queryActive();
    } else { throw new Error(d.error || '写入失败'); }
  } catch(e) {
    btn.textContent = '储存到设备'; btn.className = 'btn btn-primary'; btn.disabled = false;
    toast('✓ 坐标指令已发出（请确保代理模块开启）');
  }
}

function locateMe() {
  if (!navigator.geolocation) return toast('浏览器不支持定位');
  navigator.geolocation.getCurrentPosition(
    pos => moveTo(pos.coords.latitude, pos.coords.longitude, 16),
    err => toast('定位失败: ' + err.message, 3000),
    { enableHighAccuracy:true, timeout:10000 }
  );
}

function parseMapUrl(text) {
  let m;
  if ((m = text.match(/(?:coordinate|ll|sll)=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i))) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  if ((m = text.match(/[?&]p=[^,&%]*(?:,|%2C)(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i))) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  if ((m = text.match(/[?&]q=(-?\d{1,3}\.\d+)(?:,|%2C)(-?\d{1,3}\.\d+)/i))) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  if ((m = text.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/))) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  return null;
}

function parseUrl() {
  const input = document.getElementById('urlInput').value.trim();
  if (!input) return toast('请粘贴地图链接或坐标');
  const res = parseMapUrl(input);
  if (!res) return toast('无法解析坐标格式');
  moveTo(res.lat, res.lon, 15);
  toast('已解析坐标');
}

async function searchPlace() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return toast('请输入地名');
  toast('搜索中...');
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
    const results = await r.json();
    if (!results.length) return toast('未找到地点: ' + q);
    moveTo(parseFloat(results[0].lat), parseFloat(results[0].lon), 15);
    toast(results[0].display_name.slice(0, 30));
  } catch(e) { toast('搜索失败'); }
}

document.getElementById('searchInput').addEventListener('keydown', e => { if(e.key==='Enter') searchPlace(); });
document.getElementById('urlInput').addEventListener('keydown', e => { if(e.key==='Enter') parseUrl(); });

renderFavs();
queryActive();
<\/script>
</body>
</html>`;
}
