const DEFAULT_SALES_OPTIONS = [
  { code: "S001", name: "YUNIA" },
  { code: "S002", name: "YOGI" },
  { code: "S003", name: "IDA" },
  { code: "S004", name: "NUR" },
  { code: "S005", name: "DWI" },
  { code: "S006", name: "BENI" },
  { code: "S007", name: "RATNO" }
];

const form = document.getElementById("activityForm");
const statusEl = document.getElementById("activityStatus");
const salesCodeInput = document.getElementById("activitySalesCode");
const customerNameInput = document.getElementById("activityCustomerName");
const customerSearchResults = document.getElementById("activityCustomerSearchResults");
const btnEditCustomerManual = document.getElementById("btnEditCustomerManual");
const addressInput = document.getElementById("activityAddress");
const phoneInput = document.getElementById("activityPhone");
const customerCategoryInput = document.getElementById("activityCustomerCategory");
const resultTypeInput = document.getElementById("activityResult");
const resultKgInput = document.getElementById("activityResultKg");
const closingNoteField = document.getElementById("closingNoteField");
const closingNoteInput = document.getElementById("closingNote");
const nextPlanDateInput = document.getElementById("nextPlanDate");
const btnSubmit = document.getElementById("btnActivitySubmit");
const successModal = document.getElementById("successModalAktivitas");
const successModalMessage = document.getElementById("successModalAktivitasMessage");
const btnCloseSuccessModal = document.getElementById("btnCloseSuccessAktivitas");

const config = window.APP_CONFIG || {};
if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY.includes("<PUT_")) {
  setStatus("Please set your Supabase values in config.js first.", "error");
  throw new Error("Missing APP_CONFIG values");
}

const supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
const salesTableName = config.SALES_TABLE_NAME || "sales_master";
const activityTableName = config.ACTIVITY_TABLE_NAME || "sales_activities";
const customerSourceTable = config.TABLE_NAME || "customer_submissions";
let salesOptions = [...DEFAULT_SALES_OPTIONS];
let salesByCode = Object.fromEntries(salesOptions.map((item) => [item.code, item]));
let customerLookupTimer = null;
let latestLookupRequest = 0;
let selectedCustomerNameForLock = "";

initializeActivityForm();

async function initializeActivityForm() {
  await hydrateSalesDropdown();
  setupSuccessModal();
  registerEvents();
  syncResultBehavior();
  nextPlanDateInput.value = new Date().toISOString().split("T")[0];
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

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

async function hydrateSalesDropdown() {
  salesCodeInput.innerHTML = "<option value=\"\" selected disabled>Pilih kode sales</option>";

  try {
    const { data, error } = await supabaseClient
      .from(salesTableName)
      .select("sales_code, sales_name")
      .eq("is_active", true)
      .order("sales_code", { ascending: true });

    if (!error && data && data.length > 0) {
      salesOptions = data
        .map((row) => ({
          code: String(row.sales_code || "").trim(),
          name: String(row.sales_name || "").trim()
        }))
        .filter((item) => item.code && item.name);
    }
  } catch (error) {
    console.warn("Unable to load sales master for aktivitas form. Using fallback.", error.message);
  }

  salesByCode = Object.fromEntries(salesOptions.map((item) => [item.code, item]));

  const fragment = document.createDocumentFragment();
  for (const item of salesOptions) {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = `${item.code} - ${item.name}`;
    fragment.appendChild(option);
  }

  salesCodeInput.appendChild(fragment);
}

function registerEvents() {
  customerNameInput.addEventListener("input", onCustomerNameInput);
  customerNameInput.addEventListener("blur", () => {
    // Delay so click on suggestion can still fire before the list closes.
    setTimeout(() => {
      customerSearchResults.innerHTML = "";
    }, 140);
  });
  resultTypeInput.addEventListener("change", syncResultBehavior);
  btnEditCustomerManual.addEventListener("click", onEditCustomerManualClick);
  form.addEventListener("submit", onSubmit);
  form.addEventListener("reset", onReset);
}

function onCustomerNameInput() {
  const query = customerNameInput.value.trim();
  const normalized = query.toLowerCase();

  if (selectedCustomerNameForLock && normalized !== selectedCustomerNameForLock) {
    setCustomerAutofillLock(false);
    selectedCustomerNameForLock = "";
  }

  if (customerLookupTimer) {
    clearTimeout(customerLookupTimer);
  }

  if (!query) {
    customerSearchResults.innerHTML = "";
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
      .from(customerSourceTable)
      .select("id, customer_name, address, phone, customer_category")
      .ilike("customer_name", `%${query}%`)
      .order("id", { ascending: false })
      .limit(6);

    if (error) {
      throw new Error(error.message);
    }

    if (requestId !== latestLookupRequest) {
      return;
    }

    const items = data || [];
    renderCustomerSearchResults(items);

    const normalizedQuery = query.toLowerCase();
    const exactMatch = items.find((item) => String(item.customer_name || "").toLowerCase() === normalizedQuery);
    if (exactMatch) {
      applyCustomerAutofill(exactMatch);
      setStatus("Data pembeli ditemukan dan autofill diterapkan.", "ok");
    }
  } catch (error) {
    console.error(error);
    setStatus(`Customer lookup failed: ${error.message}`, "error");
  }
}

function applyCustomerAutofill(item) {
  if (item.address) {
    addressInput.value = item.address;
  }

  if (item.phone) {
    phoneInput.value = item.phone;
  }

  if (item.customer_category) {
    const category = String(item.customer_category).toLowerCase();
    if (category === "retail" || category === "distributor") {
      customerCategoryInput.value = category;
    }
  }

  selectedCustomerNameForLock = String(item.customer_name || "").toLowerCase();
  setCustomerAutofillLock(true);
}

function setCustomerAutofillLock(locked) {
  addressInput.readOnly = locked;
  phoneInput.readOnly = locked;
  customerCategoryInput.disabled = locked;
  btnEditCustomerManual.hidden = !locked;
}

function onEditCustomerManualClick() {
  setCustomerAutofillLock(false);
  selectedCustomerNameForLock = "";
  setStatus("Mode edit manual aktif untuk alamat/telp/kategori.", "ok");
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
    const categoryLabel = item.customer_category || "-";
    meta.textContent = `Telp: ${item.phone || "-"} | Kategori: ${categoryLabel}`;

    button.appendChild(title);
    button.appendChild(meta);

    button.addEventListener("click", () => {
      customerNameInput.value = item.customer_name || "";
      applyCustomerAutofill(item);
      customerSearchResults.innerHTML = "";
      setStatus("Pembeli existing dipilih. Field alamat/telp/kategori terkunci, klik Edit Manual jika perlu.", "ok");
    });

    fragment.appendChild(button);
  }

  customerSearchResults.appendChild(fragment);
}

function syncResultBehavior() {
  const resultType = resultTypeInput.value;
  const isClosing = resultType === "closing";

  if (isClosing) {
    resultKgInput.readOnly = false;
    resultKgInput.min = "0.01";
    if (Number(resultKgInput.value || 0) <= 0) {
      resultKgInput.value = "";
    }
    closingNoteField.hidden = false;
    closingNoteInput.required = true;
    return;
  }

  if (resultType === "non_closing") {
    resultKgInput.value = "0";
    resultKgInput.readOnly = true;
    resultKgInput.min = "0";
    closingNoteField.hidden = true;
    closingNoteInput.required = false;
    closingNoteInput.value = "";
    return;
  }

  resultKgInput.readOnly = false;
  resultKgInput.min = "0";
  closingNoteField.hidden = true;
  closingNoteInput.required = false;
  closingNoteInput.value = "";
}

function getSelectedSales() {
  const code = String(salesCodeInput.value || "").trim();
  const selected = salesByCode[code];
  if (!selected) {
    throw new Error("Please select a valid sales code.");
  }
  return selected;
}

function buildPayload() {
  const selectedSales = getSelectedSales();
  const resultType = form.result_type.value;
  const resultKg = Number(form.result_kg.value || 0);

  if (resultType === "closing" && resultKg <= 0) {
    throw new Error("Hasil closing harus lebih dari 0 kg.");
  }

  if (resultType === "non_closing" && resultKg !== 0) {
    throw new Error("Untuk non closing, hasil harus 0 kg.");
  }

  return {
    sales_code: selectedSales.code,
    sales_name: selectedSales.name,
    customer_name: form.customer_name.value.trim(),
    address: form.address.value.trim(),
    phone: form.phone.value.trim(),
    customer_category: form.customer_category.value,
    contact_method: form.contact_method.value,
    activity_type: form.activity_type.value,
    activity_kind: form.activity_kind.value,
    result_type: resultType,
    result_kg: resultKg,
    closing_note: resultType === "closing" ? form.closing_note.value.trim() : null,
    next_plan_date: form.next_plan_date.value,
    shipping_hd_kg: Number(form.shipping_hd_kg.value || 0),
    shipping_pp_kg: Number(form.shipping_pp_kg.value || 0),
    shipping_sdt_kg: Number(form.shipping_sdt_kg.value || 0),
    detail_note: form.detail_note.value.trim() || null,
    submitted_at: new Date().toISOString()
  };
}

async function onSubmit(event) {
  event.preventDefault();
  btnSubmit.disabled = true;

  try {
    setStatus("Submitting aktivitas harian sales...");
    const payload = buildPayload();
    const { error } = await supabaseClient.from(activityTableName).insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    setStatus("Aktivitas harian berhasil disimpan.", "ok");
    openSuccessModal("Data Form Aktivitas Harian Sales berhasil dikirim.");
    form.reset();
    nextPlanDateInput.value = new Date().toISOString().split("T")[0];
    syncResultBehavior();
  } catch (error) {
    console.error(error);
    setStatus(`Submit failed: ${error.message}`, "error");
  } finally {
    btnSubmit.disabled = false;
  }
}

function onReset() {
  setTimeout(() => {
    setStatus("");
    selectedCustomerNameForLock = "";
    setCustomerAutofillLock(false);
    customerSearchResults.innerHTML = "";
    nextPlanDateInput.value = new Date().toISOString().split("T")[0];
    syncResultBehavior();
  }, 0);
}
