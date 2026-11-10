const bdtFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFormat = new Intl.NumberFormat('en-IN');
const formatBDT = (amount) => `৳${bdtFormat.format(Number(amount || 0))}`;

const statusBanner = document.getElementById('status-banner');
const sumProductsEl = document.getElementById('sum-products');
const sumStockEl = document.getElementById('sum-stock');
const avgPriceEl = document.getElementById('avg-price');
const sumValuationEl = document.getElementById('sum-valuation');

const addForm = document.getElementById('add-product-form');
const addCategorySelect = document.getElementById('add-category');
const addSubmitBtn = document.getElementById('add-submit-btn');
const filterForm = document.getElementById('filter-form');
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const tbody = document.getElementById('inventory-tbody');
const tableCaption = document.getElementById('inventory-table-caption');

const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-product-form');
const editCategorySelect = document.getElementById('edit-category');
const editCancelBtn = document.getElementById('edit-cancel-btn');
const editSubmitBtn = document.getElementById('edit-submit-btn');

const addCategoryForm = document.getElementById('add-category-form');
const newCategoryInput = document.getElementById('new-category-name');
const addCatBtn = document.getElementById('add-cat-btn');
const newCatError = document.getElementById('new-cat-error');
const catCountBadge = document.getElementById('cat-count-badge');
const categoryListEl = document.getElementById('category-list');

const deleteDialog = document.getElementById('delete-dialog');
const deleteDialogTitle = document.getElementById('delete-dialog-title');
const deleteMessage = document.getElementById('delete-dialog-message');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

const currentRecords = new Map();
const customSelectRegistry = new Map();
let categoriesData = [];
let categoryList = [];
let pendingDelete = null;
let bannerTimer = null;
let activeCustomClose = null;

function showBanner(message, tone = 'success') {
  clearTimeout(bannerTimer);
  statusBanner.textContent = message;
  statusBanner.dataset.state = 'visible';
  statusBanner.dataset.tone = tone;
  if (tone === 'success') {
    bannerTimer = setTimeout(() => {
      statusBanner.textContent = '';
      delete statusBanner.dataset.state;
      delete statusBanner.dataset.tone;
    }, 4500);
  }
}

function refreshCustomSelect(selectEl) {
  const sync = customSelectRegistry.get(selectEl);
  if (sync) sync();
}

function setupCustomSelect(select) {
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'custom-select-btn';
  btn.setAttribute('aria-expanded', 'false');

  const labelSpan = document.createElement('span');
  labelSpan.className = 'custom-select-label';

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('width', '16');
  chevron.setAttribute('height', '16');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '2.25');
  chevron.setAttribute('stroke-linecap', 'round');
  chevron.setAttribute('stroke-linejoin', 'round');
  chevron.classList.add('custom-select-chevron');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm6 9 6 6 6-6');
  chevron.appendChild(path);

  btn.append(labelSpan, chevron);

  const menu = document.createElement('ul');
  menu.className = 'custom-select-menu';
  menu.hidden = true;

  wrapper.append(btn, menu);
  select.before(wrapper);
  select.classList.add('sr-only-select');
  select.tabIndex = -1;

  const sync = () => {
    const chosen = select.selectedOptions[0] || select.options[0];
    labelSpan.textContent = chosen ? chosen.textContent : '';
    btn.classList.toggle('is-placeholder', Boolean(select.required && !select.value));
    wrapper.classList.toggle('is-invalid', select.classList.contains('is-invalid'));

    menu.replaceChildren();
    for (const opt of select.options) {
      if (opt.disabled) continue;
      const li = document.createElement('li');
      li.className = 'custom-select-option';
      li.dataset.value = opt.value;
      const isSelected = opt.selected && (!select.required || Boolean(opt.value));
      li.setAttribute('aria-selected', String(isSelected));

      const txt = document.createElement('span');
      txt.textContent = opt.textContent;
      li.appendChild(txt);

      if (isSelected) {
        const chk = document.createElement('span');
        chk.className = 'custom-select-check';
        chk.textContent = '✓';
        li.appendChild(chk);
      }
      menu.appendChild(li);
    }
  };

  const closeMenu = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (activeCustomClose === closeMenu) activeCustomClose = null;
  };

  const openMenu = () => {
    if (activeCustomClose && activeCustomClose !== closeMenu) activeCustomClose();
    sync();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    activeCustomClose = closeMenu;
  };

  btn.addEventListener('click', () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  menu.addEventListener('click', (e) => {
    const li = e.target.closest('.custom-select-option');
    if (!li) return;
    select.value = li.dataset.value;
    select.classList.remove('is-invalid');
    sync();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    closeMenu();
  });

  customSelectRegistry.set(select, sync);
  sync();
}

for (const select of [addCategorySelect, categoryFilter, editCategorySelect]) {
  setupCustomSelect(select);
}

document.addEventListener('click', (e) => {
  if (activeCustomClose && !e.target.closest('.custom-select')) {
    activeCustomClose();
  }
});

function validateFormFields(form) {
  let valid = true;
  for (const el of form.querySelectorAll('input, select')) {
    const fieldValid = el.checkValidity();
    el.classList.toggle('is-invalid', !fieldValid);
    if (el.parentElement && el.parentElement.classList.contains('cat-input-group')) {
      el.parentElement.classList.toggle('is-invalid', !fieldValid);
    }
    if (el.tagName === 'SELECT') refreshCustomSelect(el);
    if (!fieldValid) valid = false;
  }
  return valid;
}

function clearValidationState(form) {
  for (const el of form.querySelectorAll('input, select, .cat-input-group')) {
    el.classList.remove('is-invalid');
    if (el.tagName === 'SELECT') refreshCustomSelect(el);
  }
}

document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('input, select') && e.target.checkValidity()) {
    e.target.classList.remove('is-invalid');
    if (e.target.parentElement && e.target.parentElement.classList.contains('cat-input-group')) {
      e.target.parentElement.classList.remove('is-invalid');
    }
  }
});

function syncCategorySelects(names) {
  categoryList = names;
  const prevAdd = addCategorySelect.value;
  const prevFilter = categoryFilter.value;
  const prevEdit = editCategorySelect.value;

  addCategorySelect.replaceChildren();
  const addPlaceholder = document.createElement('option');
  addPlaceholder.value = '';
  addPlaceholder.disabled = true;
  addPlaceholder.defaultSelected = true;
  addPlaceholder.textContent = 'Select category...';
  addCategorySelect.appendChild(addPlaceholder);
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    addCategorySelect.appendChild(opt);
  }
  addCategorySelect.value = names.includes(prevAdd) ? prevAdd : '';

  categoryFilter.replaceChildren();
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.defaultSelected = true;
  allOpt.textContent = 'All Categories';
  categoryFilter.appendChild(allOpt);
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    categoryFilter.appendChild(opt);
  }
  categoryFilter.value = names.includes(prevFilter) ? prevFilter : '';

  editCategorySelect.replaceChildren();
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    editCategorySelect.appendChild(opt);
  }
  if (names.includes(prevEdit)) editCategorySelect.value = prevEdit;

  refreshCustomSelect(addCategorySelect);
  refreshCustomSelect(categoryFilter);
  refreshCustomSelect(editCategorySelect);
}

function renderCategoryList(categories) {
  catCountBadge.textContent = `${intFormat.format(categories.length)} total`;
  categoryListEl.replaceChildren();

  if (categories.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'category-item';
    emptyLi.textContent = 'No categories saved yet.';
    categoryListEl.appendChild(emptyLi);
    return;
  }

  for (const cat of categories) {
    const count = Number(cat.product_count || 0);
    const li = document.createElement('li');
    li.className = 'category-item';

    const meta = document.createElement('div');
    meta.className = 'category-meta';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'category-name';
    nameSpan.textContent = cat.category_name;

    const countSpan = document.createElement('span');
    countSpan.className = 'category-count';
    countSpan.textContent = intFormat.format(count);

    meta.append(nameSpan, countSpan);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-cat-delete';
    delBtn.dataset.deleteCatId = String(cat.category_id);
    delBtn.textContent = 'Delete';

    li.append(meta, delBtn);
    categoryListEl.appendChild(li);
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load categories.');
    categoriesData = data;
    syncCategorySelects(data.map((c) => c.category_name));
    renderCategoryList(data);
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

newCategoryInput.addEventListener('input', () => {
  newCatError.textContent = 'Please enter a category name.';
});

addCategoryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const category_name = newCategoryInput.value.replace(/\s+/g, ' ').trim();
  if (!category_name) {
    newCategoryInput.value = '';
    newCatError.textContent = 'Please enter a category name.';
    validateFormFields(addCategoryForm);
    return;
  }

  addCatBtn.disabled = true;
  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_name }),
    });
    const data = await res.json();
    if (!res.ok) {
      newCatError.textContent = data.error || 'Could not add category.';
      newCategoryInput.classList.add('is-invalid');
      newCategoryInput.parentElement.classList.add('is-invalid');
      newCategoryInput.focus();
      return;
    }

    addCategoryForm.reset();
    newCatError.textContent = 'Please enter a category name.';
    clearValidationState(addCategoryForm);
    await loadCategories();

    if (!addCategorySelect.value) {
      addCategorySelect.value = data.category_name;
      addCategorySelect.classList.remove('is-invalid');
      refreshCustomSelect(addCategorySelect);
    }

    showBanner(`Added category "${data.category_name}".`);
  } catch (err) {
    showBanner(err.message, 'error');
  } finally {
    addCatBtn.disabled = false;
  }
});

categoryListEl.addEventListener('click', (e) => {
  const delBtn = e.target.closest('button[data-delete-cat-id]');
  if (!delBtn) return;
  const catId = Number(delBtn.dataset.deleteCatId);
  const cat = categoriesData.find((c) => Number(c.category_id) === catId);
  if (!cat) return;

  const count = Number(cat.product_count || 0);
  if (count > 0) {
    pendingDelete = null;
    deleteDialogTitle.textContent = 'Category In Use';
    deleteMessage.textContent = `Cannot delete "${cat.category_name}" because ${count === 1 ? '1 product is' : `${intFormat.format(count)} products are`} still assigned to it. Reassign or delete those products first.`;
    deleteConfirmBtn.hidden = true;
    deleteCancelBtn.textContent = 'Close';
    deleteDialog.showModal();
    return;
  }

  pendingDelete = { type: 'category', id: cat.category_id, name: cat.category_name };
  deleteDialogTitle.textContent = 'Delete Category?';
  deleteMessage.textContent = `Permanently remove the "${cat.category_name}" category from the database? This action cannot be undone.`;
  deleteConfirmBtn.hidden = false;
  deleteConfirmBtn.textContent = 'Delete Category';
  deleteCancelBtn.textContent = 'Cancel';
  deleteDialog.showModal();
});

function buildQueryString() {
  const params = new URLSearchParams();
  const q = searchInput.value.trim();
  const cat = categoryFilter.value.trim();
  if (q) params.set('search', q);
  if (cat) params.set('category', cat);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function renderRows(products) {
  currentRecords.clear();
  tbody.replaceChildren();

  const countLabel = products.length === 1 ? '1 item' : `${products.length} items`;
  tableCaption.textContent = `Saved Inventory Records (${countLabel})`;

  if (products.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'empty-state';
    td.textContent = 'No matching inventory records found.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const item of products) {
    currentRecords.set(item.product_id, item);
    const tr = document.createElement('tr');

    const tdId = document.createElement('td');
    tdId.className = 'col-id';
    const idBadge = document.createElement('span');
    idBadge.className = 'id-box';
    idBadge.textContent = String(item.product_id);
    tdId.appendChild(idBadge);

    const thName = document.createElement('th');
    thName.scope = 'row';
    thName.className = 'col-name';
    thName.textContent = item.product_name;

    const tdCategory = document.createElement('td');
    tdCategory.className = 'col-center';
    const catSpan = document.createElement('span');
    catSpan.className = 'cat-badge';
    catSpan.textContent = item.category;
    tdCategory.appendChild(catSpan);

    const tdStock = document.createElement('td');
    tdStock.className = 'col-center num-cell';
    if (item.stock_quantity <= 10) {
      tdStock.classList.add('low-stock');
      tdStock.textContent = `${intFormat.format(item.stock_quantity)} (Low)`;
    } else {
      tdStock.textContent = intFormat.format(item.stock_quantity);
    }

    const tdPrice = document.createElement('td');
    tdPrice.className = 'col-center num-cell';
    tdPrice.textContent = formatBDT(item.unit_price);

    const tdManager = document.createElement('td');
    tdManager.className = 'col-center manager-cell';
    tdManager.textContent = item.managed_by;

    const tdActions = document.createElement('td');
    tdActions.className = 'col-center';
    const actionWrap = document.createElement('div');
    actionWrap.className = 'row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary btn-sm';
    editBtn.dataset.action = 'edit';
    editBtn.dataset.id = String(item.product_id);
    editBtn.textContent = 'Edit';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-danger btn-sm';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.id = String(item.product_id);
    delBtn.textContent = 'Delete';

    actionWrap.append(editBtn, delBtn);
    tdActions.appendChild(actionWrap);

    tr.append(tdId, thName, tdCategory, tdStock, tdPrice, tdManager, tdActions);
    tbody.appendChild(tr);
  }
}

async function loadInventory() {
  const qs = buildQueryString();
  try {
    const [productsRes, summaryRes] = await Promise.all([
      fetch(`/api/products${qs}`),
      fetch(`/api/products/summary${qs}`),
    ]);

    const productsData = await productsRes.json();
    const summaryData = await summaryRes.json();

    if (!productsRes.ok) {
      throw new Error(productsData.error || 'Failed to load inventory.');
    }

    renderRows(productsData);
    sumProductsEl.textContent = intFormat.format(summaryData.total_products);
    sumStockEl.textContent = `${intFormat.format(summaryData.total_stock)} units`;
    avgPriceEl.textContent = formatBDT(summaryData.average_price);
    sumValuationEl.textContent = formatBDT(summaryData.total_inventory_value);
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

function readFormPayload(form) {
  const fd = new FormData(form);
  return {
    product_name: String(fd.get('product_name') || '').trim(),
    category: String(fd.get('category') || '').trim(),
    stock_quantity: Number(fd.get('stock_quantity')),
    unit_price: Number(fd.get('unit_price')),
    managed_by: String(fd.get('managed_by') || '').trim(),
  };
}

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateFormFields(addForm)) return;

  addSubmitBtn.disabled = true;
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readFormPayload(addForm)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not add product.');

    addForm.reset();
    clearValidationState(addForm);
    refreshCustomSelect(addCategorySelect);
    showBanner(`Added "${data.product_name}" (#${data.product_id}) to inventory.`);
    await Promise.all([loadInventory(), loadCategories()]);
  } catch (err) {
    showBanner(err.message, 'error');
  } finally {
    addSubmitBtn.disabled = false;
  }
});

let searchDebounce = null;
filterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loadInventory();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadInventory, 160);
});

categoryFilter.addEventListener('change', loadInventory);

filterForm.addEventListener('reset', () => {
  setTimeout(() => {
    refreshCustomSelect(categoryFilter);
    loadInventory();
  }, 0);
});

tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const record = currentRecords.get(id);
  if (!record) return;

  if (btn.dataset.action === 'edit') {
    clearValidationState(editForm);
    if (!categoryList.includes(record.category)) {
      syncCategorySelects([...categoryList, record.category].sort());
    }
    document.getElementById('edit-id').value = String(record.product_id);
    document.getElementById('edit-name').value = record.product_name;
    editCategorySelect.value = record.category;
    refreshCustomSelect(editCategorySelect);
    document.getElementById('edit-stock').value = String(record.stock_quantity);
    document.getElementById('edit-price').value = Number(record.unit_price).toFixed(2);
    document.getElementById('edit-manager').value = record.managed_by;
    editDialog.showModal();
  } else if (btn.dataset.action === 'delete') {
    pendingDelete = { type: 'product', id: record.product_id, name: record.product_name };
    deleteDialogTitle.textContent = 'Delete Inventory Record?';
    deleteMessage.textContent = `Delete "#${record.product_id} ${record.product_name}" (managed by ${record.managed_by})? This action cannot be undone.`;
    deleteConfirmBtn.hidden = false;
    deleteConfirmBtn.textContent = 'Delete Permanently';
    deleteCancelBtn.textContent = 'Cancel';
    deleteDialog.showModal();
  }
});

editCancelBtn.addEventListener('click', () => editDialog.close());
editDialog.addEventListener('close', () => {
  if (activeCustomClose) activeCustomClose();
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateFormFields(editForm)) return;

  const id = Number(document.getElementById('edit-id').value);
  editSubmitBtn.disabled = true;
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(readFormPayload(editForm)),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update product.');

    editDialog.close();
    showBanner(`Updated "#${data.product_id} ${data.product_name}" successfully.`);
    await Promise.all([loadInventory(), loadCategories()]);
  } catch (err) {
    showBanner(err.message, 'error');
  } finally {
    editSubmitBtn.disabled = false;
  }
});

deleteDialog.addEventListener('close', async () => {
  const action = deleteDialog.returnValue;
  deleteDialog.returnValue = '';
  const target = pendingDelete;
  pendingDelete = null;

  if (action !== 'delete' || !target) return;

  if (target.type === 'category') {
    try {
      const res = await fetch(`/api/categories/${target.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete category.');

      if (categoryFilter.value === target.name) categoryFilter.value = '';
      if (addCategorySelect.value === target.name) addCategorySelect.value = '';
      showBanner(`Deleted category "${target.name}".`);
      await Promise.all([loadCategories(), loadInventory()]);
    } catch (err) {
      showBanner(err.message, 'error');
    }
    return;
  }

  try {
    const res = await fetch(`/api/products/${target.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not delete product.');

    showBanner(`Deleted product #${target.id} from inventory.`);
    await Promise.all([loadInventory(), loadCategories()]);
  } catch (err) {
    showBanner(err.message, 'error');
  }
});

Promise.all([loadCategories(), loadInventory()]);
