const SALES_OPTIONS = ["YUNIA", "BENI", "IDA", "YOGI", "NUR", "DWI"];

const form = document.getElementById("customerForm");
const statusEl = document.getElementById("status");
const salesNameInput = document.getElementById("salesName");
const customerSearchResults = document.getElementById("customerSearchResults");
const customerNameInput = document.getElementById("customerName");
const customerIdInput = document.getElementById("customerId");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const addressInput = document.getElementById("address");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const btnLocation = document.getElementById("btnLocation");
const btnSubmit = document.getElementById("btnSubmit");

const config = window.APP_CONFIG || {};
if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY.includes("<PUT_")) {
  setStatus("Please set your Supabase values in config.js first.", "error");
  throw new Error("Missing APP_CONFIG values");
}

const supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
let nextCustomerCode = "CST000001";
let customerLookupTimer = null;
let latestLookupRequest = 0;

hydrateSalesDropdown();
bindPhotoPreview();
registerEvents();
prepareNextCustomerCode();

function hydrateSalesDropdown() {
  const list = document.createDocumentFragment();
  for (const item of SALES_OPTIONS) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    list.appendChild(option);
  }
  salesNameInput.appendChild(list);
}

function registerEvents() {
  btnLocation.addEventListener("click", onGetLocationClick);
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
      return payload.address || "";
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

        const resolvedAddress = await reverseGeocode(lat, lon);
        if (resolvedAddress) {
          addressInput.value = resolvedAddress;
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
  if (file.size > 5 * 1024 * 1024) {
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

    const photoFile = photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;
    const photoError = validatePhoto(photoFile);
    if (photoError) {
      setStatus(photoError, "error");
      return;
    }

    const customerCode = customerIdInput.value || nextCustomerCode;
    const uploadedPhoto = await uploadPhoto(photoFile, customerCode);

    const payload = {
      sales_name: form.sales_name.value.trim(),
      customer_name: form.customer_name.value.trim(),
      latitude: latitudeInput.value ? Number(latitudeInput.value) : null,
      longitude: longitudeInput.value ? Number(longitudeInput.value) : null,
      address: form.address.value.trim(),
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

function onResetForm() {
  setTimeout(() => {
    latitudeInput.value = "";
    longitudeInput.value = "";
    addressInput.value = "";
    customerSearchResults.innerHTML = "";
    photoPreview.style.display = "none";
    photoPreview.removeAttribute("src");
    setStatus("");
    customerIdInput.value = nextCustomerCode;
  }, 0);
}


