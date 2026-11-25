// Skrip CMS Panel Pentadbir Mari Order (Vanilla JS)

const state = {
  token: sessionStorage.getItem('mari_admin_token') || '',
  soundEnabled: true,
  currentTab: 'orders',
  orders: [],
  previousOrderIds: new Set(),
  orderFilter: 'semua',
  items: [],
  categories: [],
  settings: {},
  pollingTimer: null
};

// Format RM
function formatRM(num) {
  return 'RM ' + (parseFloat(num) || 0).toFixed(2);
}

// Bunyi Notifikasi Pesanan Baru (Web Audio API)
function playNewOrderSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.3);
    });
  } catch (e) {
    console.warn('Audio tidak disokong:', e);
  }
}

// -------------------------------------------------------------
// Peraturan #3: Pemampatan Gambar di Browser (<canvas> max 480px,
// latar putih untuk PNG, saiz akhir < 95 KB)
// -------------------------------------------------------------
async function compressImageInBrowser(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Fail yang dipilih bukan gambar yang sah.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 480; // Had maksimum 480px

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Latar belakang putih untuk menangani ketelusan PNG (Peraturan #3)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Mampatkan berperingkat sehingga saiz akhir < 95 KB (95 * 1024 = 97280 bytes)
        let quality = 0.85;
        function tryCompress() {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Gagal memproses gambar pada kanvas.'));
              return;
            }
            if (blob.size <= 95 * 1024 || quality <= 0.30) {
              resolve(blob);
            } else {
              quality -= 0.15;
              tryCompress();
            }
          }, 'image/jpeg', quality);
        }

        tryCompress();
      };
      img.onerror = () => reject(new Error('Fail gambar rosak atau tidak dapat dibaca.'));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca fail.'));
    reader.readAsDataURL(file);
  });
}

// Muat naik gambar yang telah dimampatkan ke D1 (POST /api/admin/images)
async function uploadCompressedImage(file) {
  const blob = await compressImageInBrowser(file);
  const formData = new FormData();
  formData.append('image', blob, 'menu-image.jpg');

  const res = await fetchWithAuth('/api/admin/images', {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Gagal memuat naik gambar.');
  }
  return data; // { id, url }
}

// Pembungkus fetch dengan header Bearer Token
async function fetchWithAuth(url, options = {}) {
  const headers = options.headers || {};
  if (state.token && !(headers instanceof Headers)) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    sessionStorage.removeItem('mari_admin_token');
    state.token = '';
    alert('Sesi anda telah tamat. Sila log masuk semula.');
    window.location.reload();
  }

  return res;
}

// =============================================================
// Log Masuk & Pengesahan Admin
// =============================================================
async function checkAuthStatus() {
  const alert503 = document.getElementById('alert-not-configured');
  try {
    const res = await fetch('/api/admin/auth-status');
    if (res.status === 503) {
      alert503.classList.remove('hidden');
      return false;
    } else {
      alert503.classList.add('hidden');
    }
  } catch (e) {
    console.warn('Gagal semak auth-status:', e);
  }

  // Jika token wujud, uji pengesahan dengan memuat tetapan
  if (state.token) {
    try {
      const res = await fetchWithAuth('/api/admin/settings');
      if (res.ok) {
        showApp();
        return true;
      }
    } catch (e) {
      console.warn('Token tidak sah:', e);
    }
  }

  showLogin();
  return false;
}

function showLogin() {
  document.getElementById('auth-wrapper').classList.remove('hidden');
  document.getElementById('admin-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-wrapper').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  initAppData();
}

async function handleLogin(e) {
  e.preventDefault();
  const password = document.getElementById('admin-password').value;
  const errorBox = document.getElementById('login-error-msg');
  const btnSubmit = document.getElementById('btn-submit-login');

  errorBox.classList.add('hidden');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Mengesahkan...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (res.status === 503) {
      document.getElementById('alert-not-configured').classList.remove('hidden');
      throw new Error(data.error || 'ADMIN_PASSWORD belum diset dalam persekitaran Cloudflare Workers (503).');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Kata laluan salah.');
    }

    state.token = data.token;
    sessionStorage.setItem('mari_admin_token', data.token);
    showApp();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Log Masuk CMS';
  }
}

// Inisialisasi Data Aplikasi Admin
async function initAppData() {
  await loadSettings();
  await loadCategories();
  await loadItems();
  await loadOrders();

  // Mula Polling Pesanan Dapur setiap 4 saat
  if (state.pollingTimer) clearInterval(state.pollingTimer);
  state.pollingTimer = setInterval(loadOrders, 4000);
}

// =============================================================
// TAB 1: PENGURUSAN PESANAN DAPUR
// =============================================================
async function loadOrders() {
  try {
    const res = await fetchWithAuth(`/api/admin/orders?status=${state.orderFilter}`);
    if (!res.ok) return;
    const orders = await res.json();

    // Semak pesanan baru untuk bunyikan notifikasi audio
    let hasNewOrder = false;
    for (const ord of orders) {
      if (ord.status === 'baru' && !state.previousOrderIds.has(ord.id)) {
        hasNewOrder = true;
      }
    }

    if (hasNewOrder && state.previousOrderIds.size > 0) {
      playNewOrderSound();
    }

    state.orders = orders;
    state.previousOrderIds = new Set(orders.map(o => o.id));

    renderOrders();
    updateOrderCounts();
  } catch (err) {
    console.warn('Ralat muat pesanan:', err);
  }
}

function updateOrderCounts() {
  const baruCount = state.orders.filter(o => o.status === 'baru').length;
  const disedCount = state.orders.filter(o => o.status === 'disediakan').length;

  document.getElementById('badge-orders-count').textContent = baruCount + disedCount;
  document.getElementById('count-baru').textContent = baruCount;
  document.getElementById('count-disediakan').textContent = disedCount;
}

function renderOrders() {
  const container = document.getElementById('orders-grid');
  if (state.orders.length === 0) {
    container.innerHTML = `
      <div class="loading-state">
        <p>Tiada pesanan dalam kategori penapis ini.</p>
      </div>
    `;
    return;
  }

  let html = '';
  for (const ord of state.orders) {
    const dateFormatted = new Date(ord.created_at).toLocaleTimeString('ms-MY', {
      hour: '2-digit', minute: '2-digit'
    });

    let itemsHtml = '';
    for (const it of ord.items || []) {
      itemsHtml += `
        <div class="order-item-entry">
          <div><span class="order-item-qty">${it.quantity}x</span> ${it.item_name}</div>
          <div>${formatRM(it.subtotal)}</div>
        </div>
      `;
    }

    let actionsHtml = '';
    if (ord.status === 'baru') {
      actionsHtml = `
        <button class="btn-card-action btn-act-cook" onclick="updateOrderStatus(${ord.id}, 'disediakan')">
          👨‍🍳 Mula Sedia
        </button>
        <button class="btn-card-action btn-act-cancel" onclick="updateOrderStatus(${ord.id}, 'batal')">
          Batal
        </button>
      `;
    } else if (ord.status === 'disediakan') {
      actionsHtml = `
        <button class="btn-card-action btn-act-done" onclick="updateOrderStatus(${ord.id}, 'selesai')">
          ✅ Selesai
        </button>
        <button class="btn-card-action btn-act-cancel" onclick="updateOrderStatus(${ord.id}, 'batal')">
          Batal
        </button>
      `;
    } else {
      actionsHtml = `<span style="font-size: 0.8rem; color: #94a3b8;">Tiada tindakan lanjut</span>`;
    }

    html += `
      <div class="order-card status-${ord.status}">
        <div class="order-card-header">
          <div>
            <div class="order-queue-num">${ord.queue_number}</div>
            <div class="order-meta-info">
              ${ord.order_type === 'takeaway' ? '🥡 Bungkus' : '🍽️ Makan Sini'} • ${dateFormatted}
            </div>
          </div>
          <span class="badge-order-status ${ord.status}">${ord.status}</span>
        </div>

        ${ord.notes ? `<div class="order-notes-tag">📝 ${ord.notes}</div>` : ''}

        <div class="order-items-box">
          ${itemsHtml}
        </div>

        <div class="order-card-footer">
          <div class="order-total-sum">${formatRM(ord.total_price)}</div>
          <div class="order-actions-bar">
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

window.updateOrderStatus = async function(orderId, status) {
  try {
    const res = await fetchWithAuth(`/api/admin/orders/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Gagal mengemaskini status');
    loadOrders();
  } catch (err) {
    alert(err.message);
  }
};

// =============================================================
// TAB 2: PENGURUSAN ITEM MENU
// =============================================================
async function loadItems() {
  try {
    const res = await fetchWithAuth('/api/admin/items');
    if (!res.ok) return;
    state.items = await res.json();
    renderItemsTable();
  } catch (err) {
    console.error('Ralat muat items:', err);
  }
}

function renderItemsTable() {
  const tbody = document.getElementById('tbody-items');
  const catFilter = document.getElementById('select-filter-cat').value;
  const search = document.getElementById('input-search-item').value.toLowerCase().trim();

  const filtered = state.items.filter(item => {
    const matchCat = catFilter === 'all' || item.category_id == catFilter;
    const matchSearch = !search || item.name.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">Tiada item menu ditemui.</td></tr>`;
    return;
  }

  let html = '';
  for (const it of filtered) {
    const hasImage = !!it.image_id;
    const thumb = hasImage
      ? `<img src="/api/images/${it.image_id}" alt="${it.name}" onerror="this.parentElement.innerHTML='${it.emoji || '🍽️'}';">`
      : (it.emoji || '🍽️');

    html += `
      <tr>
        <td>
          <div class="cell-thumb">${thumb}</div>
        </td>
        <td>
          <strong>${it.name}</strong>
          ${it.description ? `<br><small style="color: #64748b;">${it.description}</small>` : ''}
        </td>
        <td><span class="badge-order-status disediakan">${it.category_name || '-'}</span></td>
        <td>
          <div class="quick-price-box">
            <span>RM</span>
            <input 
              type="number" 
              step="0.10" 
              min="0"
              class="input-quick-price" 
              value="${parseFloat(it.price).toFixed(2)}" 
              data-id="${it.id}"
              onchange="quickUpdatePrice(${it.id}, this.value)"
            />
          </div>
        </td>
        <td>
          <label class="switch-toggle" title="Aktif / Nyahaktif">
            <input type="checkbox" ${it.is_active === 1 ? 'checked' : ''} onchange="toggleItemActive(${it.id})">
            <span class="slider round"></span>
          </label>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon-action" onclick="duplicateItem(${it.id})" title="Salin (Duplicate) Item">
              📋 Salin
            </button>
            <button class="btn-icon-action" onclick="openEditItemModal(${it.id})" title="Edit Item">
              ✏️ Edit
            </button>
            <button class="btn-icon-action btn-delete" onclick="deleteItem(${it.id})" title="Padam Item">
              🗑️ Padam
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

window.quickUpdatePrice = async function(id, price) {
  try {
    const res = await fetchWithAuth(`/api/admin/items/${id}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: parseFloat(price) })
    });
    if (!res.ok) throw new Error('Gagal menukar harga');
    const item = state.items.find(i => i.id === id);
    if (item) item.price = parseFloat(price);
  } catch (err) {
    alert('Ralat tukar harga: ' + err.message);
  }
};

window.toggleItemActive = async function(id) {
  try {
    const res = await fetchWithAuth(`/api/admin/items/${id}/toggle`, {
      method: 'PATCH'
    });
    if (!res.ok) throw new Error('Gagal menukar status');
    const data = await res.json();
    const item = state.items.find(i => i.id === id);
    if (item) item.is_active = data.is_active;
  } catch (err) {
    alert(err.message);
  }
};

window.duplicateItem = async function(id) {
  if (!confirm('Salin hidangan ini sebagai item baru?')) return;
  try {
    const res = await fetchWithAuth(`/api/admin/items/${id}/duplicate`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Gagal menyalin item');
    await loadItems();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteItem = async function(id) {
  if (!confirm('Adakah anda pasti ingin memadamkan item ini?')) return;
  try {
    const res = await fetchWithAuth(`/api/admin/items/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Gagal memadam item');
    await loadItems();
  } catch (err) {
    alert(err.message);
  }
};

// =============================================================
// MODAL TAMBAH / EDIT ITEM MENU
// =============================================================
const itemModal = {
  overlay: document.getElementById('modal-item'),
  title: document.getElementById('modal-item-title'),
  form: document.getElementById('form-item'),
  id: document.getElementById('item-form-id'),
  imageId: document.getElementById('item-form-image-id'),
  name: document.getElementById('item-name'),
  category: document.getElementById('item-category'),
  price: document.getElementById('item-price'),
  emoji: document.getElementById('item-emoji'),
  desc: document.getElementById('item-desc'),
  fileInput: document.getElementById('item-image-file'),
  previewWrap: document.getElementById('image-preview-wrap'),
  btnRemoveImg: document.getElementById('btn-remove-item-img'),
  isActive: document.getElementById('item-is-active'),
  btnSave: document.getElementById('btn-save-item')
};

function populateCategoryDropdown() {
  const options = state.categories.map(c => `<option value="${c.id}">${c.icon || '📁'} ${c.name}</option>`).join('');
  itemModal.category.innerHTML = options;

  // Juga kemaskini dropdown penapis di atas jadual
  const filterSelect = document.getElementById('select-filter-cat');
  filterSelect.innerHTML = `<option value="all">Semua Kategori</option>` + options;
}

function openAddItemModal() {
  itemModal.title.textContent = 'Tambah Item Menu Baru';
  itemModal.id.value = '';
  itemModal.imageId.value = '';
  itemModal.name.value = '';
  itemModal.price.value = '';
  itemModal.emoji.value = '🍽️';
  itemModal.desc.value = '';
  itemModal.fileInput.value = '';
  itemModal.isActive.checked = true;
  itemModal.previewWrap.innerHTML = `<span class="preview-placeholder">Tiada Gambar</span>`;
  itemModal.btnRemoveImg.classList.add('hidden');

  populateCategoryDropdown();
  itemModal.overlay.classList.remove('hidden');
}

window.openEditItemModal = function(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  itemModal.title.textContent = 'Edit Item Menu';
  itemModal.id.value = item.id;
  itemModal.imageId.value = item.image_id || '';
  itemModal.name.value = item.name;
  itemModal.price.value = parseFloat(item.price).toFixed(2);
  itemModal.emoji.value = item.emoji || '🍽️';
  itemModal.desc.value = item.description || '';
  itemModal.fileInput.value = '';
  itemModal.isActive.checked = item.is_active === 1;

  populateCategoryDropdown();
  itemModal.category.value = item.category_id;

  if (item.image_id) {
    itemModal.previewWrap.innerHTML = `<img src="/api/images/${item.image_id}" alt="Preview">`;
    itemModal.btnRemoveImg.classList.remove('hidden');
  } else {
    itemModal.previewWrap.innerHTML = `<span class="preview-placeholder">Tiada Gambar</span>`;
    itemModal.btnRemoveImg.classList.add('hidden');
  }

  itemModal.overlay.classList.remove('hidden');
};

async function handleItemSubmit(e) {
  e.preventDefault();
  const id = itemModal.id.value;
  const isEdit = !!id;

  itemModal.btnSave.disabled = true;
  itemModal.btnSave.textContent = 'Menyimpan...';

  try {
    let currentImageId = itemModal.imageId.value;

    // Jika pengguna memilih fail gambar baru, mampatkan di browser (< 95 KB) & muat naik
    if (itemModal.fileInput.files.length > 0) {
      const file = itemModal.fileInput.files[0];
      const uploadRes = await uploadCompressedImage(file);
      currentImageId = uploadRes.id;
    }

    const payload = {
      name: itemModal.name.value.trim(),
      category_id: parseInt(itemModal.category.value),
      price: parseFloat(itemModal.price.value),
      emoji: itemModal.emoji.value.trim() || '🍽️',
      description: itemModal.desc.value.trim(),
      image_id: currentImageId,
      is_active: itemModal.isActive.checked ? 1 : 0
    };

    const url = isEdit ? `/api/admin/items/${id}` : '/api/admin/items';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menyimpan item.');
    }

    itemModal.overlay.classList.add('hidden');
    await loadItems();
  } catch (err) {
    alert('Ralat simpan item: ' + err.message);
  } finally {
    itemModal.btnSave.disabled = false;
    itemModal.btnSave.textContent = 'Simpan Item';
  }
}

// =============================================================
// TAB 3: PENGURUSAN KATEGORI & SEKATAN 409
// =============================================================
async function loadCategories() {
  try {
    const res = await fetchWithAuth('/api/admin/categories');
    if (!res.ok) return;
    state.categories = await res.json();
    renderCategoriesTable();
    populateCategoryDropdown();
  } catch (err) {
    console.error('Ralat muat kategori:', err);
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('tbody-categories');
  if (state.categories.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Tiada kategori ditemui.</td></tr>`;
    return;
  }

  let html = '';
  for (const cat of state.categories) {
    html += `
      <tr>
        <td style="font-size: 1.6rem; text-align: center;">${cat.icon || '📁'}</td>
        <td><strong>${cat.name}</strong></td>
        <td>${cat.sort_order}</td>
        <td>
          <span class="pill-count" style="font-weight: 700; font-size: 0.85rem;">
            ${cat.item_count || 0} item
          </span>
        </td>
        <td>
          <label class="switch-toggle" title="Kategori Aktif">
            <input type="checkbox" ${cat.is_active === 1 ? 'checked' : ''} onchange="toggleCategoryActive(${cat.id})">
            <span class="slider round"></span>
          </label>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon-action" onclick="openEditCategoryModal(${cat.id})">✏️ Edit</button>
            <button class="btn-icon-action btn-delete" onclick="deleteCategory(${cat.id}, ${cat.item_count || 0})">🗑️ Padam</button>
          </div>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

window.toggleCategoryActive = async function(id) {
  try {
    const res = await fetchWithAuth(`/api/admin/categories/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Gagal menukar status');
    await loadCategories();
  } catch (err) {
    alert(err.message);
  }
};

// Padam Kategori (SEKAT DENGAN 409 JIKA MASIH ADA ITEM)
window.deleteCategory = async function(id, count) {
  if (count > 0) {
    alert(`⚠️ TINDAKAN DISEKAT (HTTP 409 CONFLICT):\nKategori ini masih mempunyai ${count} item menu. Sila padam atau pindahkan item tersebut sebelum memadam kategori.`);
    return;
  }

  if (!confirm('Adakah anda pasti ingin memadamkan kategori ini?')) return;

  try {
    const res = await fetchWithAuth(`/api/admin/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (res.status === 409) {
      alert(`⚠️ TINDAKAN DISEKAT (HTTP 409 CONFLICT):\n${data.error}`);
      return;
    }

    if (!res.ok) {
      throw new Error(data.error || 'Gagal memadam kategori');
    }

    await loadCategories();
  } catch (err) {
    alert(err.message);
  }
};

// Modal Kategori
const catModal = {
  overlay: document.getElementById('modal-category'),
  title: document.getElementById('modal-cat-title'),
  form: document.getElementById('form-category'),
  id: document.getElementById('cat-form-id'),
  name: document.getElementById('cat-name'),
  icon: document.getElementById('cat-icon'),
  sort: document.getElementById('cat-sort'),
  isActive: document.getElementById('cat-is-active')
};

function openAddCategoryModal() {
  catModal.title.textContent = 'Tambah Kategori Baru';
  catModal.id.value = '';
  catModal.name.value = '';
  catModal.icon.value = '📁';
  catModal.sort.value = (state.categories.length + 1);
  catModal.isActive.checked = true;
  catModal.overlay.classList.remove('hidden');
}

window.openEditCategoryModal = function(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  catModal.title.textContent = 'Edit Kategori';
  catModal.id.value = cat.id;
  catModal.name.value = cat.name;
  catModal.icon.value = cat.icon || '📁';
  catModal.sort.value = cat.sort_order;
  catModal.isActive.checked = cat.is_active === 1;
  catModal.overlay.classList.remove('hidden');
};

async function handleCategorySubmit(e) {
  e.preventDefault();
  const id = catModal.id.value;
  const isEdit = !!id;

  const payload = {
    name: catModal.name.value.trim(),
    icon: catModal.icon.value.trim() || '📁',
    sort_order: parseInt(catModal.sort.value) || 0,
    is_active: catModal.isActive.checked ? 1 : 0
  };

  try {
    const url = isEdit ? `/api/admin/categories/${id}` : '/api/admin/categories';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kategori.');

    catModal.overlay.classList.add('hidden');
    await loadCategories();
  } catch (err) {
    alert('Ralat simpan kategori: ' + err.message);
  }
}

// =============================================================
// TAB 4: TETAPAN KEDAI & BUKA/TUTUP CEPAT
// =============================================================
async function loadSettings() {
  try {
    const res = await fetchWithAuth('/api/admin/settings');
    if (!res.ok) return;
    state.settings = await res.json();

    document.getElementById('admin-store-name-display').textContent = state.settings.store_name || 'Mari Order';
    document.getElementById('set-store-name').value = state.settings.store_name || '';
    document.getElementById('set-banner-text').value = state.settings.store_banner_text || '';

    const isOpen = state.settings.is_open === '1';
    const radioOpen = document.querySelector(`input[name="set_is_open"][value="${isOpen ? '1' : '0'}"]`);
    if (radioOpen) radioOpen.checked = true;

    // Header Quick Toggle
    const quickToggle = document.getElementById('quick-toggle-store');
    const quickText = document.getElementById('quick-store-status-text');
    quickToggle.checked = isOpen;
    quickText.textContent = isOpen ? 'BUKA' : 'TUTUP';
    quickText.className = 'status-text-pill ' + (isOpen ? '' : 'closed');
  } catch (err) {
    console.error('Ralat muat settings:', err);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const storeName = document.getElementById('set-store-name').value.trim();
  const bannerText = document.getElementById('set-banner-text').value.trim();
  const isOpenVal = document.querySelector('input[name="set_is_open"]:checked').value;

  const btn = document.getElementById('btn-save-settings');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const res = await fetchWithAuth('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_name: storeName,
        store_banner_text: bannerText,
        is_open: isOpenVal
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan tetapan');

    alert('✅ Tetapan kedai berjaya disimpan!');
    await loadSettings();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Simpan Perubahan Tetapan';
  }
}

// Quick toggle kedai buka/tutup di navbar
async function handleQuickToggleStore(e) {
  const newIsOpen = e.target.checked ? '1' : '0';
  try {
    const res = await fetchWithAuth('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_open: newIsOpen })
    });
    if (!res.ok) throw new Error('Gagal menukar status');
    await loadSettings();
  } catch (err) {
    alert(err.message);
    e.target.checked = !e.target.checked;
  }
}

// =============================================================
// Navigasi Tab & Event Listeners
// =============================================================
function initNavigation() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(`pane-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');

      state.currentTab = btn.dataset.tab;
    });
  });

  // Penapis status pesanan
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.orderFilter = pill.dataset.status;
      loadOrders();
    });
  });

  // Sound toggle button
  const btnSound = document.getElementById('btn-toggle-sound');
  btnSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    document.getElementById('sound-icon').textContent = state.soundEnabled ? '🔔' : '🔕';
    document.getElementById('sound-text').textContent = state.soundEnabled ? 'Bunyi Hidup' : 'Bunyi Bisu';
  });

  // Logout button
  document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('Log keluar dari CMS Pentadbir?')) {
      sessionStorage.removeItem('mari_admin_token');
      window.location.reload();
    }
  });

  // Quick store status switch
  document.getElementById('quick-toggle-store').addEventListener('change', handleQuickToggleStore);

  // Filter & carian item menu
  document.getElementById('select-filter-cat').addEventListener('change', renderItemsTable);
  document.getElementById('input-search-item').addEventListener('input', renderItemsTable);

  // Butang tambah item & kategori
  document.getElementById('btn-add-item').addEventListener('click', openAddItemModal);
  document.getElementById('btn-close-item-modal').addEventListener('click', () => itemModal.overlay.classList.add('hidden'));
  document.getElementById('btn-cancel-item').addEventListener('click', () => itemModal.overlay.classList.add('hidden'));
  itemModal.form.addEventListener('submit', handleItemSubmit);

  document.getElementById('btn-add-category').addEventListener('click', openAddCategoryModal);
  document.getElementById('btn-close-cat-modal').addEventListener('click', () => catModal.overlay.classList.add('hidden'));
  document.getElementById('btn-cancel-cat').addEventListener('click', () => catModal.overlay.classList.add('hidden'));
  catModal.form.addEventListener('submit', handleCategorySubmit);

  document.getElementById('form-settings').addEventListener('submit', handleSettingsSubmit);

  // Gambar preview & remove
  itemModal.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        itemModal.previewWrap.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
        itemModal.btnRemoveImg.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  itemModal.btnRemoveImg.addEventListener('click', () => {
    itemModal.fileInput.value = '';
    itemModal.imageId.value = '';
    itemModal.previewWrap.innerHTML = `<span class="preview-placeholder">Tiada Gambar</span>`;
    itemModal.btnRemoveImg.classList.add('hidden');
  });

  // Form login submit
  document.getElementById('form-login').addEventListener('submit', handleLogin);
}

// Mula Semakan & Boot
window.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  checkAuthStatus();
});
