const DEFAULT_SALES_OPTIONS = [
  { code: "S001", name: "YUNIA" },
  { code: "S002", name: "YOGI" },
  { code: "S003", name: "IDA" },
  { code: "S004", name: "NUR" },
  { code: "S005", name: "DWI" },
  { code: "S006", name: "BENI" },
  { code: "S007", name: "RATNO" }
];

const form = document.getElementById("customerForm");
const statusEl = document.getElementById("status");
const salesNameInput = document.getElementById("salesName");
const customerSearchResults = document.getElementById("customerSearchResults");
const customerNameInput = document.getElementById("customerName");
const customerIdInput = document.getElementById("customerId");
const contactMethodInput = document.getElementById("contactMethod");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const addressInput = document.getElementById("address");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const kanvasingFields = document.getElementById("kanvasingFields");
const callFields = document.getElementById("callFields");
const callStreetAddressInput = document.getElementById("callStreetAddress");
const callProvinceInput = document.getElementById("callProvince");
const callCityInput = document.getElementById("callCity");
const callDistrictInput = document.getElementById("callDistrict");
const callSubdistrictInput = document.getElementById("callSubdistrict");
const btnLocation = document.getElementById("btnLocation");
const btnSubmit = document.getElementById("btnSubmit");
const successModal = document.getElementById("successModalInformasi");
const successModalMessage = document.getElementById("successModalInformasiMessage");
const btnCloseSuccessModal = document.getElementById("btnCloseSuccessInformasi");

const config = window.APP_CONFIG || {};
if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY.includes("<PUT_")) {
  setStatus("Please set your Supabase values in config.js first.", "error");
  throw new Error("Missing APP_CONFIG values");
}

const supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
const salesTableName = config.SALES_TABLE_NAME || "sales_master";
const wilayahApiBase = (config.WILAYAH_API_BASE_URL || "https://www.emsifa.com/api-wilayah-indonesia/api").replace(/\/+$/, "");
let nextCustomerCode = "CST000001";
let customerLookupTimer = null;
let latestLookupRequest = 0;
let salesOptions = [...DEFAULT_SALES_OPTIONS];
let salesByCode = Object.fromEntries(salesOptions.map((item) => [item.code, item]));
let cachedProvinces = [];
let lastReverseGeocodeDetails = null;

initializeApp();

async function initializeApp() {
  await hydrateSalesDropdown();
  bindPhotoPreview();
  setupSuccessModal();
  registerEvents();
  syncContactMethodMode();
  await prepareNextCustomerCode();
}

function setupSuccessModal() {
  if (!successModal || !btnCloseSuccessModal) {
    return;
  }

  btnCloseSuccessModal.addEventListener("click", closeSuccessModal);
  successModal.addEventListener("click", (event) => {
    const target = event.target;
    if (target && target.dataset && target.dataset.modalClose === "true") {
      closeSuccessModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !successModal.hidden) {
      closeSuccessModal();
    }
  });
}

function openSuccessModal(message) {
  if (!successModal || !successModalMessage) {
    return;
  }
  successModalMessage.textContent = message;
  successModal.hidden = false;
}

function closeSuccessModal() {
  if (!successModal) {
    return;
  }
  successModal.hidden = true;
}

async function hydrateSalesDropdown() {
  salesNameInput.innerHTML = "<option value=\"\" selected disabled>Pilih kode sales</option>";

  try {
    const { data, error } = await supabaseClient
      .from(salesTableName)
      .select("sales_code, sales_name")
      .eq("is_active", true)
      .order("sales_code", { ascending: true });

    if (!error && data && data.length > 0) {
      salesOptions = data.map((row) => ({
        code: String(row.sales_code || "").trim(),
        name: String(row.sales_name || "").trim()
      })).filter((item) => item.code && item.name);
    }
  } catch (error) {
    console.warn("Unable to load sales master. Using frontend fallback list.", error.message);
  }

  salesByCode = Object.fromEntries(salesOptions.map((item) => [item.code, item]));
  const list = document.createDocumentFragment();
  for (const item of salesOptions) {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = `${item.code} - ${item.name}`;
    list.appendChild(option);
  }
  salesNameInput.appendChild(list);
}

function getSelectedSales() {
  const code = (salesNameInput.value || "").trim();
  const selected = salesByCode[code];
  if (!selected) {
    throw new Error("Please select a valid sales code.");
  }
  return selected;
}

function registerEvents() {
  btnLocation.addEventListener("click", onGetLocationClick);
  contactMethodInput.addEventListener("change", onContactMethodChange);
  callProvinceInput.addEventListener("change", onCallProvinceChange);
  callCityInput.addEventListener("change", onCallCityChange);
  callDistrictInput.addEventListener("change", onCallDistrictChange);
  customerNameInput.addEventListener("input", onCustomerNameInput);
  customerNameInput.addEventListener("blur", () => {
    // Delay so click on suggestion can still fire before the list closes.
    setTimeout(() => {
      customerSearchResults.innerHTML = "";
    }, 140);
  });
  form.addEventListener("submit", onSubmitForm);
  form.addEventListener("reset", onResetForm);
}

function onContactMethodChange() {
  syncContactMethodMode();
}

function syncContactMethodMode() {
  const mode = contactMethodInput.value;
  const isKanvasing = mode === "kanvasing";
  const isCall = mode === "call_telp_wa";

  kanvasingFields.hidden = !isKanvasing;
  callFields.hidden = !isCall;

  addressInput.required = isKanvasing;
  photoInput.required = isKanvasing;

  callStreetAddressInput.required = isCall;
  callProvinceInput.required = isCall;
  callCityInput.required = isCall;
  callDistrictInput.required = isCall;
  callSubdistrictInput.required = isCall;

  if (isCall) {
    latitudeInput.value = "";
    longitudeInput.value = "";
    addressInput.value = "";
    photoInput.value = "";
    photoPreview.style.display = "none";
    photoPreview.removeAttribute("src");
    ensureCallProvincesLoaded();
  }

  if (isKanvasing) {
    resetCallAddressFields();
  }
}

async function ensureCallProvincesLoaded() {
  if (cachedProvinces.length > 0) {
    return;
  }

  try {
    const provinces = await fetchWilayahList("provinces.json");
    cachedProvinces = provinces;
    populateWilayahSelect(callProvinceInput, provinces, "Pilih provinsi");
    setStatus("Data provinsi loaded.", "ok");
  } catch (error) {
    console.error(error);
    setStatus(`Gagal memuat data provinsi: ${error.message}`, "error");
  }
}

async function onCallProvinceChange() {
  const provinceId = callProvinceInput.value;
  resetWilayahSelect(callCityInput, "Pilih kota/kabupaten");
  resetWilayahSelect(callDistrictInput, "Pilih kecamatan");
  resetWilayahSelect(callSubdistrictInput, "Pilih kelurahan");

  if (!provinceId) {
    return;
  }

  try {
    const cities = await fetchWilayahList(`regencies/${encodeURIComponent(provinceId)}.json`);
    populateWilayahSelect(callCityInput, cities, "Pilih kota/kabupaten");
  } catch (error) {
    console.error(error);
    setStatus(`Gagal memuat kota/kabupaten: ${error.message}`, "error");
  }
}

async function onCallCityChange() {
  const cityId = callCityInput.value;
  resetWilayahSelect(callDistrictInput, "Pilih kecamatan");
  resetWilayahSelect(callSubdistrictInput, "Pilih kelurahan");

  if (!cityId) {
    return;
  }

  try {
    const districts = await fetchWilayahList(`districts/${encodeURIComponent(cityId)}.json`);
    populateWilayahSelect(callDistrictInput, districts, "Pilih kecamatan");
  } catch (error) {
    console.error(error);
    setStatus(`Gagal memuat kecamatan: ${error.message}`, "error");
  }
}

async function onCallDistrictChange() {
  const districtId = callDistrictInput.value;
  resetWilayahSelect(callSubdistrictInput, "Pilih kelurahan");

  if (!districtId) {
    return;
  }

  try {
    const subdistricts = await fetchWilayahList(`villages/${encodeURIComponent(districtId)}.json`);
    populateWilayahSelect(callSubdistrictInput, subdistricts, "Pilih kelurahan");
  } catch (error) {
    console.error(error);
    setStatus(`Gagal memuat kelurahan: ${error.message}`, "error");
  }
}

async function fetchWilayahList(path) {
  const response = await fetch(`${wilayahApiBase}/${path}`);
  if (!response.ok) {
    throw new Error(`Wilayah API error ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function populateWilayahSelect(selectElement, items, placeholderText) {
  resetWilayahSelect(selectElement, placeholderText);

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const option = document.createElement("option");
    option.value = String(item.id || "");
    option.textContent = String(item.name || "");
    fragment.appendChild(option);
  }

  selectElement.appendChild(fragment);
}

function resetWilayahSelect(selectElement, placeholderText) {
  selectElement.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = placeholderText;
  selectElement.appendChild(placeholder);
}

function getSelectedOptionLabel(selectElement) {
  const option = selectElement.options[selectElement.selectedIndex];
  return option ? String(option.textContent || "").trim() : "";
}

function buildCallAddress() {
  const parts = [
    form.call_street_address.value.trim(),
    getSelectedOptionLabel(callSubdistrictInput),
    getSelectedOptionLabel(callDistrictInput),
    getSelectedOptionLabel(callCityInput),
    getSelectedOptionLabel(callProvinceInput)
  ].filter(Boolean);

  return parts.join(", ");
}

function resetCallAddressFields() {
  callStreetAddressInput.value = "";
  resetWilayahSelect(callProvinceInput, "Pilih provinsi");
  resetWilayahSelect(callCityInput, "Pilih kota/kabupaten");
  resetWilayahSelect(callDistrictInput, "Pilih kecamatan");
  resetWilayahSelect(callSubdistrictInput, "Pilih kelurahan");

  if (cachedProvinces.length > 0) {
    populateWilayahSelect(callProvinceInput, cachedProvinces, "Pilih provinsi");
  }
}

function onCustomerNameInput() {
  const query = customerNameInput.value.trim();

  if (customerLookupTimer) {
    clearTimeout(customerLookupTimer);
  }

  if (!query) {
    renderCustomerSearchResults([]);
    customerIdInput.value = nextCustomerCode;
    setStatus("");
    return;
  }

  customerLookupTimer = setTimeout(() => {
    lookupCustomerByName(query);
  }, 320);
}

async function lookupCustomerByName(query) {
  const requestId = ++latestLookupRequest;

  try {
    const { data, error } = await supabaseClient
      .from(config.TABLE_NAME)
      .select("id, customer_code, customer_name")
      .ilike("customer_name", `%${query}%`)
      .order("id", { ascending: false })
      .limit(6);

    if (error) {
      throw new Error(error.message);
    }

    if (requestId !== latestLookupRequest) {
      return;
    }

    renderCustomerSearchResults(data || []);

    const normalizedQuery = query.toLowerCase();
    const exactMatch = (data || []).find((item) => item.customer_name.toLowerCase() === normalizedQuery);

    if (exactMatch) {
      customerIdInput.value = getDisplayCustomerCode(exactMatch);
      setStatus("Existing customer detected. Customer ID autofilled.", "ok");
      return;
    }

    customerIdInput.value = nextCustomerCode;
    if (data && data.length > 0) {
      setStatus("Similar customer names found. Select one if needed.", "ok");
    } else {
      setStatus("New customer name. Using next Customer ID.");
    }
  } catch (error) {
    console.error(error);
    customerIdInput.value = nextCustomerCode;
    setStatus(`Customer lookup failed: ${error.message}`, "error");
  }
}

function getDisplayCustomerCode(item) {
  if (item.customer_code) {
    return item.customer_code;
  }
  return formatCustomerCode(Number(item.id || 0));
}

function renderCustomerSearchResults(items) {
  customerSearchResults.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "customer-search-empty";
    empty.textContent = "No results";
    customerSearchResults.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-item";

    const title = document.createElement("span");
    title.className = "search-result-title";
    title.textContent = item.customer_name;

    const meta = document.createElement("span");
    meta.className = "search-result-meta";
    meta.textContent = `ID: ${getDisplayCustomerCode(item)} | Record #${item.id}`;

    button.appendChild(title);
    button.appendChild(meta);

    button.addEventListener("click", () => {
      customerNameInput.value = item.customer_name;
      customerIdInput.value = getDisplayCustomerCode(item);
      customerSearchResults.innerHTML = "";
      setStatus("Existing customer selected and autofilled.", "ok");
    });

    fragment.appendChild(button);
  }

  customerSearchResults.appendChild(fragment);
}

function bindPhotoPreview() {
  photoInput.addEventListener("change", () => {
    const file = photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;
    if (!file) {
      photoPreview.style.display = "none";
      photoPreview.removeAttribute("src");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      photoPreview.src = String(reader.result || "");
      photoPreview.style.display = "block";
    };
    reader.readAsDataURL(file);
  });
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function formatCustomerCode(number) {
  return `CST${String(number).padStart(6, "0")}`;
}

async function prepareNextCustomerCode() {
  const { data, error } = await supabaseClient
    .from(config.TABLE_NAME)
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to fetch next customer ID:", error.message);
    nextCustomerCode = formatCustomerCode(1);
  } else {
    const nextId = data && data.id ? Number(data.id) + 1 : 1;
    nextCustomerCode = formatCustomerCode(nextId);
  }

  customerIdInput.value = nextCustomerCode;
}

async function reverseGeocode(lat, lon) {
  const encodedLat = encodeURIComponent(lat);
  const encodedLon = encodeURIComponent(lon);

  const endpointCandidates = [];

  if (config.REVERSE_GEOCODE_URL) {
    endpointCandidates.push(config.REVERSE_GEOCODE_URL.replace(/\/+$/, ""));
  } else {
    endpointCandidates.push(`${config.SUPABASE_URL}/functions/v1/reverse-geocode`);

    // Fallback for projects using the dedicated Edge Function domain.
    const projectRefMatch = String(config.SUPABASE_URL).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
    if (projectRefMatch && projectRefMatch[1]) {
      endpointCandidates.push(`https://${projectRefMatch[1]}.functions.supabase.co/reverse-geocode`);
    }
  }

  let lastErrorMessage = "";

  for (const baseUrl of endpointCandidates) {
    const endpoint = `${baseUrl}?lat=${encodedLat}&lon=${encodedLon}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
          apikey: config.SUPABASE_ANON_KEY
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text();
        if (response.status === 500 && detail.includes("Missing GEOAPIFY_KEY")) {
          throw new Error("Reverse geocode server is not configured. Set GEOAPIFY_KEY in Supabase Edge Function secrets.");
        }
        if (response.status === 502 && detail.includes("Geoapify request failed")) {
          throw new Error(`Geoapify reverse geocode failed. Check GEOAPIFY_KEY validity/quota. Server detail: ${detail}`);
        }
        lastErrorMessage = `Reverse geocode failed (${response.status}): ${detail || "empty response"}`;

        // Try next candidate only when function path is not found.
        if (response.status === 404) {
          continue;
        }

        throw new Error(lastErrorMessage);
      }

      const payload = await response.json();
      return {
        address: payload.address || "",
        streetAddress: payload.streetAddress || "",
        province: payload.province || "",
        city: payload.city || "",
        district: payload.district || "",
        subdistrict: payload.subdistrict || ""
      };
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Reverse geocode request timed out.");
      }

      if (
        error.message && (
          error.message.startsWith("Reverse geocode failed") ||
          error.message.startsWith("Reverse geocode server") ||
          error.message.startsWith("Geoapify reverse geocode failed")
        )
      ) {
        throw error;
      }

      lastErrorMessage = "Failed to reach reverse geocode service. Check internet/CORS or deploy the edge function.";
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`${lastErrorMessage || "Reverse geocode service unavailable."} Ensure function 'reverse-geocode' is deployed.`);
}

async function onGetLocationClick() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported by this browser.", "error");
    return;
  }

  setStatus("Getting current location...");
  btnLocation.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const lat = Number(position.coords.latitude).toFixed(8);
        const lon = Number(position.coords.longitude).toFixed(8);
        latitudeInput.value = lat;
        longitudeInput.value = lon;

        const geocode = await reverseGeocode(lat, lon);
        lastReverseGeocodeDetails = geocode;

        if (geocode.address) {
          addressInput.value = geocode.address;
          setStatus("Location and address loaded.", "ok");
        } else {
          setStatus("Location loaded, but address could not be resolved.");
        }
      } catch (err) {
        console.error(err);
        setStatus(`Location found, but reverse geocoding failed. ${err.message}`, "error");
      } finally {
        btnLocation.disabled = false;
      }
    },
    (error) => {
      btnLocation.disabled = false;
      let message = "Unable to retrieve your location.";
      if (error.code === error.PERMISSION_DENIED) {
        message = "Location permission denied.";
      }
      if (error.code === error.POSITION_UNAVAILABLE) {
        message = "Location information unavailable.";
      }
      if (error.code === error.TIMEOUT) {
        message = "Location request timed out.";
      }
      setStatus(message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function validatePhoto(file) {
  if (!file) {
    return "Please upload a photo.";
  }
  if (!file.type.startsWith("image/")) {
    return "File must be an image.";
  }
  if (file.size > 20 * 1024 * 1024) {
    return "Photo size max 5MB.";
  }
  return "";
}

async function uploadPhoto(file, customerCode) {
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "jpg";
  const path = `${customerCode}/${Date.now()}_${crypto.randomUUID()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(config.STORAGE_BUCKET)
    .upload(path, file, { upsert: false, cacheControl: "3600" });

  if (error) {
    throw new Error(`Photo upload failed: ${error.message}`);
  }

  const { data } = supabaseClient.storage.from(config.STORAGE_BUCKET).getPublicUrl(path);
  return {
    photo_path: path,
    photo_url: data && data.publicUrl ? data.publicUrl : null
  };
}

async function onSubmitForm(event) {
  event.preventDefault();
  btnSubmit.disabled = true;

  try {
    setStatus("Uploading photo and submitting data...");
    const selectedSales = getSelectedSales();
    const contactMethod = form.contact_method.value;
    const isKanvasing = contactMethod === "kanvasing";
    const isCall = contactMethod === "call_telp_wa";

    if (!isKanvasing && !isCall) {
      throw new Error("Please select valid contact method.");
    }

    let uploadedPhoto = {
      photo_path: null,
      photo_url: null
    };

    if (isKanvasing) {
      const photoFile = photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;
      const photoError = validatePhoto(photoFile);
      if (photoError) {
        setStatus(photoError, "error");
        return;
      }

      uploadedPhoto = await uploadPhoto(photoFile, customerCodeOrNext());
    }

    if (isCall && !form.call_street_address.value.trim()) {
      throw new Error("Please fill nama jalan / detail alamat.");
    }

    const customerCode = customerCodeOrNext();
    const finalAddress = isKanvasing ? form.address.value.trim() : buildCallAddress();
    if (!finalAddress) {
      throw new Error("Alamat pembeli wajib diisi.");
    }

    const payload = {
      sales_code: selectedSales.code,
      sales_name: selectedSales.name,
      customer_name: form.customer_name.value.trim(),
      customer_category: form.customer_category.value,
      contact_method: contactMethod,
      latitude: isKanvasing && latitudeInput.value ? Number(latitudeInput.value) : null,
      longitude: isKanvasing && longitudeInput.value ? Number(longitudeInput.value) : null,
      address: finalAddress,
      call_street_address: isCall ? form.call_street_address.value.trim() : (lastReverseGeocodeDetails ? lastReverseGeocodeDetails.streetAddress : null),
      call_province: isCall ? getSelectedOptionLabel(callProvinceInput) : (lastReverseGeocodeDetails ? lastReverseGeocodeDetails.province : null),
      call_city: isCall ? getSelectedOptionLabel(callCityInput) : (lastReverseGeocodeDetails ? lastReverseGeocodeDetails.city : null),
      call_district: isCall ? getSelectedOptionLabel(callDistrictInput) : (lastReverseGeocodeDetails ? lastReverseGeocodeDetails.district : null),
      call_subdistrict: isCall ? getSelectedOptionLabel(callSubdistrictInput) : (lastReverseGeocodeDetails ? lastReverseGeocodeDetails.subdistrict : null),
      phone: form.phone.value.trim(),
      estimated_omset_kg: Number(form.estimated_omset_kg.value || 0),
      photo_path: uploadedPhoto.photo_path,
      photo_url: uploadedPhoto.photo_url,
      submitted_at: new Date().toISOString()
    };

    const { error } = await supabaseClient.from(config.TABLE_NAME).insert(payload);
    if (error) {
      throw new Error(error.message);
    }

    setStatus("Data submitted successfully.", "ok");
    openSuccessModal("Data Form Informasi Pembeli berhasil dikirim.");
    form.reset();
    latitudeInput.value = "";
    longitudeInput.value = "";
    photoPreview.style.display = "none";
    photoPreview.removeAttribute("src");
    await prepareNextCustomerCode();
  } catch (error) {
    console.error(error);
    setStatus(`Submit failed: ${error.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
  }
}

function customerCodeOrNext() {
  return customerIdInput.value || nextCustomerCode;
}

function onResetForm() {
  setTimeout(() => {
    lastReverseGeocodeDetails = null;
    latitudeInput.value = "";
    longitudeInput.value = "";
    addressInput.value = "";
    resetCallAddressFields();
    customerSearchResults.innerHTML = "";
    photoPreview.style.display = "none";
    photoPreview.removeAttribute("src");
    setStatus("");
    customerIdInput.value = nextCustomerCode;
    syncContactMethodMode();
  }, 0);
}


