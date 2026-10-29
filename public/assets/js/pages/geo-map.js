// geo-map.js — Sales Geomap (dynamic).
// Loads customer locations live from Supabase.
// DEFAULT_SALES_OPTIONS and supabaseClient are provided by shared.js
//
// Data rules:
//   - Points  : rows in customer_submissions that have latitude & longitude.
//   - Status  : "Pembeli" if customer has transactions in `penjualan` or `result_type = 'closing'` in `sales_activities`
//   - Layers  : one toggleable overlay per sales ("Sales: <NAME>").
//   - Refresh : on page load, every AUTO_REFRESH_MS, when tab becomes visible, and via Refresh button.

const geoConfig = window.APP_CONFIG || {};
const geoCustomerTable = geoConfig.TABLE_NAME || "customer_submissions";
const geoPenjualanTable = geoConfig.PENJUALAN_TABLE_NAME || "penjualan";
const geoActivityTable = geoConfig.ACTIVITY_TABLE_NAME || "sales_activities";

const AUTO_REFRESH_MS = 60 * 1000;
const PAGE_SIZE = 1000;
const MAP_CENTER = [-7.3146527978494635, 109.77961372437278];
const MAP_ZOOM = 8;

const STATUS_STYLE = {
  buyer:    { label: "Pembeli",       color: "#99E194", textColor: "#1a6b1a" },
  nonBuyer: { label: "Belum Pembeli", color: "#FFC784", textColor: "#b35900" }
};

let geoMap, geoLayerControl, geoStatusEl, geoCountEl, geoBtnRefresh;
let salesLayers = new Map();
let hiddenSales = new Set();
let hasFittedBounds = false;
let isLoading = false;

window.authReady.then(() => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGeoMap);
  } else {
    initGeoMap();
  }
}).catch(() => { /* redirecting to login */ });

function initGeoMap() {
  geoStatusEl = document.getElementById("geoStatus");
  geoCountEl = document.getElementById("geoCount");
  geoBtnRefresh = document.getElementById("btnGeoRefresh");

  geoMap = L.map("geoMap", {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    zoomControl: true,
    attributionControl: false, // Nonaktifkan attribution control
    preferCanvas: true
  });

  // Base map: Flat Gray Canvas (Minimalis, bersih, tidak menutupi titik marker)
  const flatGrayLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16
  }).addTo(geoMap);

  // Alternatif Carto Positron No Labels (Sangat flat tanpa label ramai)
  const cartoNoLabels = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png", {
    maxZoom: 19,
    subdomains: "abcd"
  });

  // Alternatif OpenStreetMap standard
  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
  });

  const baseMaps = {
    "Flat Gray (Clean)": flatGrayLayer,
    "Flat Light": cartoNoLabels,
    "OpenStreetMap": osmLayer
  };

  geoLayerControl = L.control.layers(baseMaps, {}, { position: "topright", collapsed: window.innerWidth < 768 }).addTo(geoMap);

  geoMap.on("overlayremove", (e) => hiddenSales.add(e.name));
  geoMap.on("overlayadd", (e) => hiddenSales.delete(e.name));

  geoBtnRefresh.addEventListener("click", () => loadGeoData());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadGeoData();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") loadGeoData();
  }, AUTO_REFRESH_MS);

  loadGeoData();
}

async function loadGeoData() {
  if (isLoading) return;
  isLoading = true;
  geoBtnRefresh.disabled = true;
  setGeoStatus("Memuat data...");

  try {
    const [customers, buyerNames] = await Promise.all([fetchCustomers(), fetchBuyerNames()]);
    renderMarkers(customers, buyerNames);
    setGeoStatus(`Terakhir diperbarui: ${new Date().toLocaleTimeString("id-ID")}`);
  } catch (err) {
    console.error(err);
    setGeoStatus(`Gagal memuat data: ${err.message || err}`, true);
  } finally {
    isLoading = false;
    geoBtnRefresh.disabled = false;
  }
}

/** Fetch all rows with auto pagination */
async function fetchAllRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function fetchCustomers() {
  return fetchAllRows(() =>
    window.supabaseClient
      .from(geoCustomerTable)
      .select("id, customer_code, customer_name, sales_code, sales_name, latitude, longitude, estimated_omset_kg")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("id", { ascending: true })
  );
}

async function fetchBuyerNames() {
  const buyerSet = new Set();

  // 1. Coba baca dari tabel penjualan jika tabel sudah dibuat
  try {
    const pjCheck = await window.supabaseClient.from(geoPenjualanTable).select("id, customer_name").limit(1);
    if (!pjCheck.error) {
      const pjRows = await fetchAllRows(() =>
        window.supabaseClient
          .from(geoPenjualanTable)
          .select("id, customer_name")
          .order("id", { ascending: true })
      );
      pjRows.forEach((r) => {
        const n = normalizeName(r.customer_name);
        if (n) buyerSet.add(n);
      });
      return buyerSet;
    }
  } catch (e) {
    // Abaikan jika error dan fallback ke sales_activities
  }

  // 2. Fallback: baca dari tabel sales_activities yang result_type = 'closing'
  try {
    const actRows = await fetchAllRows(() =>
      window.supabaseClient
        .from(geoActivityTable)
        .select("id, customer_name")
        .eq("result_type", "closing")
        .order("id", { ascending: true })
    );
    actRows.forEach((r) => {
      const n = normalizeName(r.customer_name);
      if (n) buyerSet.add(n);
    });
  } catch (err) {
    console.warn("Gagal membaca status buyer dari sales_activities:", err);
  }

  return buyerSet;
}

function renderMarkers(customers, buyerNames) {
  salesLayers.forEach((layer) => {
    geoLayerControl.removeLayer(layer);
    geoMap.removeLayer(layer);
  });
  salesLayers = new Map();

  let buyerCount = 0;
  const bounds = [];

  for (const c of customers) {
    const lat = Number(c.latitude);
    const lng = Number(c.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const salesName = (c.sales_name || c.sales_code || "TANPA SALES").toString().toUpperCase();
    const isBuyer = buyerNames.has(normalizeName(c.customer_name));
    const style = isBuyer ? STATUS_STYLE.buyer : STATUS_STYLE.nonBuyer;
    if (isBuyer) buyerCount++;

    if (!salesLayers.has(salesName)) salesLayers.set(salesName, L.featureGroup());

    L.circleMarker([lat, lng], {
      radius: 7,
      color: style.color,
      fillColor: style.color,
      fillOpacity: 0.75,
      weight: 1.5
    })
      .bindPopup(buildPopupHtml(c, salesName, style), { maxWidth: 280 })
      .bindTooltip(`${escapeHtml(c.customer_name)} | ${style.label}`, { sticky: true })
      .addTo(salesLayers.get(salesName));

    bounds.push([lat, lng]);
  }

  [...salesLayers.keys()].sort().forEach((salesName) => {
    const label = `Sales: ${salesName}`;
    const layer = salesLayers.get(salesName);
    geoLayerControl.addOverlay(layer, label);
    if (!hiddenSales.has(label)) layer.addTo(geoMap);
  });

  if (!hasFittedBounds && bounds.length) {
    geoMap.fitBounds(bounds, { padding: [30, 30] });
    hasFittedBounds = true;
  }

  const total = bounds.length;
  geoCountEl.textContent = `${total} titik · ${buyerCount} Pembeli · ${total - buyerCount} Belum Pembeli`;
}

function buildPopupHtml(c, salesName, style) {
  const omset = Number(c.estimated_omset_kg || 0).toLocaleString("en-US");
  return `
    <div class="geo-popup">
      <b class="geo-popup-title">${escapeHtml(c.customer_name)}</b>
      <hr>
      ${c.customer_code ? `<b>ID     :</b> ${escapeHtml(c.customer_code)}<br>` : ""}
      <b>Sales  :</b> ${escapeHtml(salesName)}<br>
      <b>Status :</b> <span style="color:${style.textColor};font-weight:bold;">${style.label}</span><br>
      <b>Omset  :</b> ${omset} kg
    </div>`;
}

function normalizeName(value) {
  return (value || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeHtml(value) {
  return (value ?? "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setGeoStatus(message, isError = false) {
  geoStatusEl.textContent = message;
  geoStatusEl.classList.toggle("is-error", isError);
}
