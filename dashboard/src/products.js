const API_BASE = "/api/v1";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  let data = null;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data?.message || data?.error || `Request failed (${response.status})`);
  return data;
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));

export async function renderProducts(content) {
  content.innerHTML = `
    <section class="panel products-page">
      <div class="panel-heading">
        <div><p class="eyebrow">PRODUCT MANAGEMENT</p><h2>Products</h2></div>
        <button class="ghost-button" id="product-refresh">Refresh</button>
      </div>
      <form id="product-form" class="product-form" autocomplete="off">
        <input type="hidden" name="id" />
        <label>Name<input name="name" maxlength="120" required placeholder="Product name" /></label>
        <label>Version<input name="version" maxlength="64" placeholder="1.0.0" /></label>
        <label class="wide">Description<textarea name="description" maxlength="2000" rows="3" placeholder="Product description"></textarea></label>
        <label>Status<select name="status"><option value="ACTIVE">ACTIVE</option><option value="DISABLED">DISABLED</option></select></label>
        <div class="product-form-actions"><button class="primary-button" type="submit">Create product</button><button class="ghost-button" type="button" id="product-cancel" hidden>Cancel edit</button></div>
        <p class="form-message" id="product-message" role="status"></p>
      </form>
      <div class="product-toolbar"><input id="product-search" placeholder="Search products..." aria-label="Search products" /><select id="product-filter" aria-label="Filter products"><option value="">All statuses</option><option value="ACTIVE">ACTIVE</option><option value="DISABLED">DISABLED</option></select></div>
      <div id="product-list" class="product-list"><div class="empty"><span>◌</span><strong>Loading products...</strong></div></div>
    </section>`;

  const form = content.querySelector("#product-form");
  const list = content.querySelector("#product-list");
  const message = content.querySelector("#product-message");
  const search = content.querySelector("#product-search");
  const filter = content.querySelector("#product-filter");
  const cancel = content.querySelector("#product-cancel");
  const refresh = content.querySelector("#product-refresh");
  let products = [];

  const setMessage = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error", error);
  };

  const renderList = () => {
    const term = search.value.trim().toLowerCase();
    const status = filter.value;
    const filtered = products.filter((product) =>
      (!status || product.status === status) &&
      (!term || `${product.name} ${product.description ?? ""} ${product.version ?? ""}`.toLowerCase().includes(term)),
    );
    if (!filtered.length) {
      list.innerHTML = `<div class="empty"><span>◌</span><strong>No products found</strong><p>Create a product or change the current filter.</p></div>`;
      return;
    }
    list.innerHTML = filtered.map((product) => `
      <article class="product-row" data-id="${escapeHtml(product.id)}">
        <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.description || "No description")}</small></div>
        <span class="product-version">${escapeHtml(product.version || "—")}</span>
        <span class="product-status">${escapeHtml(product.status)}</span>
        <div class="product-actions"><button class="ghost-button" data-action="edit">Edit</button><button class="ghost-button" data-action="toggle">${product.status === "ACTIVE" ? "Disable" : "Enable"}</button><button class="danger-button" data-action="delete">Delete</button></div>
      </article>`).join("");
  };

  const load = async () => {
    setMessage("");
    list.innerHTML = `<div class="empty"><span>◌</span><strong>Loading products...</strong></div>`;
    try {
      products = (await api("/products")).products ?? [];
      renderList();
    } catch (error) {
      list.innerHTML = `<div class="empty"><span>!</span><strong>Unable to load products</strong><p>${escapeHtml(error.message)}</p></div>`;
      setMessage(error.message, true);
    }
  };

  const resetForm = () => {
    form.reset();
    form.elements.id.value = "";
    form.elements.status.value = "ACTIVE";
    form.querySelector("button[type=submit]").textContent = "Create product";
    cancel.hidden = true;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.id;
    delete data.id;
    try {
      if (id) await api(`/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) });
      else await api("/products", { method: "POST", body: JSON.stringify(data) });
      setMessage(id ? "Product updated." : "Product created.");
      resetForm();
      await load();
    } catch (error) { setMessage(error.message, true); }
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("[data-id]");
    const product = products.find((item) => item.id === row?.dataset.id);
    if (!product) return;
    if (button.dataset.action === "edit") {
      form.elements.id.value = product.id;
      form.elements.name.value = product.name;
      form.elements.version.value = product.version ?? "";
      form.elements.description.value = product.description ?? "";
      form.elements.status.value = product.status;
      form.querySelector("button[type=submit]").textContent = "Save changes";
      cancel.hidden = false;
      form.elements.name.focus();
      return;
    }
    if (button.dataset.action === "toggle") {
      try {
        await api(`/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ status: product.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }) });
        await load();
      } catch (error) { setMessage(error.message, true); }
      return;
    }
    if (button.dataset.action === "delete") {
      if (!window.confirm(`Delete product "${product.name}"? Products with licenses or scripts cannot be deleted.`)) return;
      try {
        await api(`/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
        await load();
      } catch (error) { setMessage(error.message, true); }
    }
  });

  [search, filter].forEach((control) => control.addEventListener("input", renderList));
  refresh.addEventListener("click", load);
  cancel.addEventListener("click", () => { resetForm(); setMessage(""); });
  await load();
}
