// Skrip Layan Diri Kiosk Mari Order (Vanilla JS)

// Keadaan Kiosk (State)
const state = {
  settings: {
    store_name: 'Mari Order',
    store_banner_text: '',
    is_open: '1',
    currency: 'RM'
  },
  categories: [],
  items: [],
  selectedCategory: 'all',
  cart: {}, // { [itemId]: { item, quantity } }
  orderType: 'dine_in',
  activePollingId: null,
  currentOrderId: null,
  previousOrderStatus: null
};

// DOM Elemen
const dom = {
  storeName: document.getElementById('store-name'),
  storeBanner: document.getElementById('store-banner'),
  storeStatusBadge: document.getElementById('store-status-badge'),
  storeStatusText: document.getElementById('store-status-text'),
  storeClosedBanner: document.getElementById('store-closed-banner'),
  categoryNav: document.getElementById('category-nav'),
  menuGrid: document.getElementById('menu-grid'),
  cartItemsList: document.getElementById('cart-items-list'),
  cartItemCount: document.getElementById('cart-item-count'),
  summaryQty: document.getElementById('summary-qty'),
  summaryTotal: document.getElementById('summary-total'),
  btnCheckout: document.getElementById('btn-checkout'),
  btnCheckoutPrice: document.getElementById('btn-checkout-price'),
  btnClearCart: document.getElementById('btn-clear-cart'),
  orderNotes: document.getElementById('order-notes'),
  orderTypeRadios: document.querySelectorAll('input[name="order_type"]'),
  // Modal Status
  orderSuccessModal: document.getElementById('order-success-modal'),
  liveQueueNumber: document.getElementById('live-queue-number'),
  liveOrderType: document.getElementById('live-order-type'),
  stepBaru: document.getElementById('step-baru'),
  stepDisediakan: document.getElementById('step-disediakan'),
  stepSelesai: document.getElementById('step-selesai'),
  line1: document.getElementById('line-1'),
  line2: document.getElementById('line-2'),
  statusNotificationBox: document.getElementById('status-notification-box'),
  receiptId: document.getElementById('receipt-id'),
  receiptItemsList: document.getElementById('receipt-items-list'),
  receiptTotalPrice: document.getElementById('receipt-total-price'),
  btnNewOrder: document.getElementById('btn-new-order'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  // Track Modal
  btnOpenTracker: document.getElementById('btn-open-tracker'),
  trackModal: document.getElementById('track-modal'),
  btnCloseTrackModal: document.getElementById('btn-close-track-modal'),
  inputTrackId: document.getElementById('input-track-id'),
  btnSearchOrder: document.getElementById('btn-search-order'),
  trackResultArea: document.getElementById('track-result-area')
};

// Format Mata Wang RM
function formatRM(amount) {
  return 'RM ' + (parseFloat(amount) || 0).toFixed(2);
}

// Bunyi Notifikasi Web Audio API
function playChimeSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, audioCtx.currentTime + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + idx * 0.12);
      osc.stop(audioCtx.currentTime + idx * 0.12 + 0.35);
    });
  } catch (e) {
    console.warn('Audio tidak disokong atau dihalang oleh browser:', e);
  }
}

// 1. Muat Turun Tetapan Kedai
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Gagal muat tetapan');
    const data = await res.json();
    state.settings = { ...state.settings, ...data };

    dom.storeName.textContent = state.settings.store_name || 'Mari Order';
    if (state.settings.store_banner_text) {
      dom.storeBanner.textContent = state.settings.store_banner_text;
    }

    const isOpen = state.settings.is_open === '1';
    if (isOpen) {
      dom.storeStatusBadge.className = 'store-status-badge open';
      dom.storeStatusText.textContent = 'KEDAI DIBUKA';
      dom.storeClosedBanner.classList.add('hidden');
    } else {
      dom.storeStatusBadge.className = 'store-status-badge closed';
      dom.storeStatusText.textContent = 'KEDAI DITUTUP';
      dom.storeClosedBanner.classList.remove('hidden');
    }

    updateCartUI();
  } catch (err) {
    console.error('Ralat muat tetapan:', err);
  }
}

// 2. Muat Kategori & Menu
async function loadMenu() {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('Gagal memuat turun menu');
    const data = await res.json();
    state.categories = data.categories || [];
    state.items = data.items || [];

    renderCategories();
    renderMenuGrid();
  } catch (err) {
    console.error('Ralat muat menu:', err);
    dom.menuGrid.innerHTML = `
      <div class="loading-state">
        <p style="color: #dc2626;">Ralat semasa memuatkan menu. Sila muat semula skrin.</p>
      </div>
    `;
  }
}

// Papar Bar Kategori
function renderCategories() {
  let html = `
    <button class="category-btn ${state.selectedCategory === 'all' ? 'active' : ''}" data-id="all">
      <span class="cat-icon">⭐</span>
      <span class="cat-name">Semua Menu</span>
    </button>
  `;

  for (const cat of state.categories) {
    const isActive = state.selectedCategory == cat.id;
    html += `
      <button class="category-btn ${isActive ? 'active' : ''}" data-id="${cat.id}">
        <span class="cat-icon">${cat.icon || '🍽️'}</span>
        <span class="cat-name">${cat.name}</span>
      </button>
    `;
  }

  dom.categoryNav.innerHTML = html;

  dom.categoryNav.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.id;
      renderCategories();
      renderMenuGrid();
    });
  });
}

// Papar Menu Grid dengan Fallback Emoji
function renderMenuGrid() {
  const filtered = state.selectedCategory === 'all'
    ? state.items
    : state.items.filter(it => it.category_id == state.selectedCategory);

  if (filtered.length === 0) {
    dom.menuGrid.innerHTML = `
      <div class="loading-state">
        <p>Tiada hidangan tersedia dalam kategori ini.</p>
      </div>
    `;
    return;
  }

  let html = '';
  for (const item of filtered) {
    const cartEntry = state.cart[item.id];
    const qty = cartEntry ? cartEntry.quantity : 0;
    const hasImage = !!item.image_id;
    const imageUrl = hasImage ? `/api/images/${item.image_id}` : '';

    html += `
      <div class="menu-card" data-id="${item.id}">
        <div class="card-image-wrap">
          ${hasImage ? `
            <img 
              src="${imageUrl}" 
              alt="${item.name}" 
              class="card-img" 
              loading="lazy"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            />
            <div class="card-emoji-fallback" style="display: none;">${item.emoji || '🍽️'}</div>
          ` : `
            <div class="card-emoji-fallback">${item.emoji || '🍽️'}</div>
          `}
        </div>
        <div class="card-content">
          <span class="card-category-tag">${item.category_name || ''}</span>
          <h3 class="card-title">${item.name}</h3>
          <p class="card-desc">${item.description || ''}</p>
          <div class="card-footer">
            <span class="card-price">${formatRM(item.price)}</span>
            <div class="card-action-container" id="action-container-${item.id}">
              ${qty > 0 ? `
                <div class="card-qty-control">
                  <button class="btn-qty-mini btn-card-minus" data-id="${item.id}">-</button>
                  <span class="card-qty-val">${qty}</span>
                  <button class="btn-qty-mini btn-card-plus" data-id="${item.id}">+</button>
                </div>
              ` : `
                <button class="card-btn-add" data-id="${item.id}">
                  <span>+</span> Tambah
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  dom.menuGrid.innerHTML = html;

  // Pasang event listener untuk butang Tambah / Qty
  dom.menuGrid.querySelectorAll('.card-btn-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      addToCart(id, 1);
    });
  });

  dom.menuGrid.querySelectorAll('.btn-card-plus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      addToCart(id, 1);
    });
  });

  dom.menuGrid.querySelectorAll('.btn-card-minus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      changeCartQty(id, -1);
    });
  });
}

// 3. Pengurusan Troli Pesanan
function addToCart(itemId, qty = 1) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  if (!state.cart[itemId]) {
    state.cart[itemId] = { item, quantity: 0 };
  }
  state.cart[itemId].quantity += qty;

  updateCartUI();
  renderMenuGrid();
}

function changeCartQty(itemId, delta) {
  if (!state.cart[itemId]) return;
  state.cart[itemId].quantity += delta;
  if (state.cart[itemId].quantity <= 0) {
    delete state.cart[itemId];
  }
  updateCartUI();
  renderMenuGrid();
}

function clearCart() {
  state.cart = {};
  updateCartUI();
  renderMenuGrid();
}

function updateCartUI() {
  const entries = Object.values(state.cart);
  let totalQty = 0;
  let totalPrice = 0;

  if (entries.length === 0) {
    dom.cartItemsList.innerHTML = `
      <div class="cart-empty">
        <span class="empty-icon">🥣</span>
        <p>Troli anda masih kosong.</p>
        <small>Pilih hidangan kegemaran dari menu di sebelah kiri.</small>
      </div>
    `;
  } else {
    let itemsHtml = '';
    for (const { item, quantity } of entries) {
      const subtotal = item.price * quantity;
      totalQty += quantity;
      totalPrice += subtotal;

      itemsHtml += `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${formatRM(item.price)} × ${quantity}</div>
          </div>
          <div class="cart-item-controls">
            <button class="btn-qty-mini btn-cart-dec" data-id="${item.id}">-</button>
            <span class="card-qty-val">${quantity}</span>
            <button class="btn-qty-mini btn-cart-inc" data-id="${item.id}">+</button>
          </div>
          <div class="cart-item-subtotal">${formatRM(subtotal)}</div>
        </div>
      `;
    }
    dom.cartItemsList.innerHTML = itemsHtml;

    dom.cartItemsList.querySelectorAll('.btn-cart-inc').forEach(b => {
      b.addEventListener('click', () => changeCartQty(parseInt(b.dataset.id), 1));
    });
    dom.cartItemsList.querySelectorAll('.btn-cart-dec').forEach(b => {
      b.addEventListener('click', () => changeCartQty(parseInt(b.dataset.id), -1));
    });
  }

  dom.cartItemCount.textContent = totalQty;
  dom.summaryQty.textContent = totalQty;
  dom.summaryTotal.textContent = formatRM(totalPrice);
  dom.btnCheckoutPrice.textContent = formatRM(totalPrice);

  // Semak status kedai dibuka
  const isOpen = state.settings.is_open === '1';
  dom.btnCheckout.disabled = totalQty === 0 || !isOpen;

  if (!isOpen) {
    dom.btnCheckout.querySelector('.btn-checkout-text').textContent = 'Kedai Ditutup';
  } else {
    dom.btnCheckout.querySelector('.btn-checkout-text').textContent = 'Hantar Pesanan';
  }
}

// 4. Hantar Pesanan Kiosk (POST /api/orders)
async function submitOrder() {
  const isOpen = state.settings.is_open === '1';
  if (!isOpen) {
    alert('Maaf, kedai sedang ditutup buat masa ini. Tempahan baru tidak diterima.');
    return;
  }

  const entries = Object.values(state.cart);
  if (entries.length === 0) return;

  const orderItems = entries.map(({ item, quantity }) => ({
    id: item.id,
    quantity
  }));

  const payload = {
    order_type: state.orderType,
    items: orderItems,
    notes: dom.orderNotes.value.trim()
  };

  dom.btnCheckout.disabled = true;
  dom.btnCheckout.querySelector('.btn-checkout-text').textContent = 'Menghantar Pesanan...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal menghantar pesanan.');
    }

    // Pesanan berjaya! Buka modal status langsung
    showOrderSuccessModal(data);
    clearCart();
    dom.orderNotes.value = '';
  } catch (err) {
    alert('Ralat semasa menghantar pesanan: ' + err.message);
  } finally {
    updateCartUI();
  }
}

// 5. Papar Modal Status Pesanan Langsung & Polling
function showOrderSuccessModal(orderData) {
  state.currentOrderId = orderData.order_id;
  state.previousOrderStatus = orderData.status || 'baru';

  dom.liveQueueNumber.textContent = orderData.queue_number;
  dom.liveOrderType.textContent = orderData.order_type === 'takeaway' ? '🥡 Bungkus' : '🍽️ Makan Sini';
  dom.receiptId.textContent = `#${orderData.order_id}`;
  dom.receiptTotalPrice.textContent = formatRM(orderData.total_price);

  updateStepperUI(orderData.status || 'baru');

  dom.orderSuccessModal.classList.remove('hidden');

  // Mula polling status setiap 3 saat
  if (state.activePollingId) clearInterval(state.activePollingId);
  state.activePollingId = setInterval(pollOrderStatus, 3000);
  pollOrderStatus();
}

async function pollOrderStatus() {
  if (!state.currentOrderId) return;

  try {
    const res = await fetch(`/api/orders/${state.currentOrderId}/status`);
    if (!res.ok) return;
    const order = await res.json();

    updateStepperUI(order.status);

    // Render senarai item resit jika belum lengkap
    if (order.items && order.items.length > 0) {
      let receiptHtml = '';
      for (const item of order.items) {
        receiptHtml += `
          <div class="receipt-item-line">
            <span>${item.quantity}x ${item.item_name}</span>
            <span>${formatRM(item.subtotal)}</span>
          </div>
        `;
      }
      dom.receiptItemsList.innerHTML = receiptHtml;
    }

    // Jika status baru bertukar ke 'selesai', mainkan bunyi chime!
    if (order.status === 'selesai' && state.previousOrderStatus !== 'selesai') {
      playChimeSound();
    }
    state.previousOrderStatus = order.status;

    // Hentikan polling jika sudah selesai atau dibatalkan
    if (order.status === 'selesai' || order.status === 'batal') {
      clearInterval(state.activePollingId);
      state.activePollingId = null;
    }
  } catch (e) {
    console.warn('Gagal semak status pesanan:', e);
  }
}

function updateStepperUI(status) {
  dom.stepBaru.classList.remove('active', 'completed');
  dom.stepDisediakan.classList.remove('active', 'completed');
  dom.stepSelesai.classList.remove('active', 'completed');
  dom.line1.classList.remove('active');
  dom.line2.classList.remove('active');
  dom.statusNotificationBox.className = 'status-notification-box';

  if (status === 'baru') {
    dom.stepBaru.classList.add('active');
    dom.statusNotificationBox.textContent = 'Pesanan anda telah diterima dan sedang menunggu giliran dapur.';
  } else if (status === 'disediakan') {
    dom.stepBaru.classList.add('completed');
    dom.line1.classList.add('active');
    dom.stepDisediakan.classList.add('active');
    dom.statusNotificationBox.textContent = 'Dapur sedang menyediakan hidangan panas anda. Sila tunggu sebentar.';
  } else if (status === 'selesai') {
    dom.stepBaru.classList.add('completed');
    dom.line1.classList.add('active');
    dom.stepDisediakan.classList.add('completed');
    dom.line2.classList.add('active');
    dom.stepSelesai.classList.add('active', 'completed');
    dom.statusNotificationBox.className = 'status-notification-box ready';
    dom.statusNotificationBox.innerHTML = '🔔 <strong>PESANAN ANDA SUDAH SEDIA!</strong> Sila ambil di kaunter sekarang.';
  } else if (status === 'batal') {
    dom.statusNotificationBox.textContent = '❌ Pesanan ini telah dibatalkan.';
    dom.statusNotificationBox.style.color = '#dc2626';
  }
}

// 6. Semak Status Giliran Bebas (Track Modal)
async function trackOrderById() {
  const orderId = dom.inputTrackId.value.trim();
  if (!orderId) {
    alert('Sila masukkan ID pesanan.');
    return;
  }

  dom.btnSearchOrder.disabled = true;
  dom.btnSearchOrder.textContent = 'Menyemak...';

  try {
    const res = await fetch(`/api/orders/${orderId}/status`);
    const data = await res.json();
    if (!res.ok) {
      dom.trackResultArea.classList.remove('hidden');
      dom.trackResultArea.innerHTML = `<p style="color: #dc2626;">Pesanan ID #${orderId} tidak ditemui.</p>`;
      return;
    }

    const statusLabels = {
      baru: '📝 Pesanan Diterima (Menunggu Dapur)',
      disediakan: '👨‍🍳 Sedang Disediakan',
      selesai: '✅ Siap / Sedia Diambil di Kaunter',
      batal: '❌ Dibatalkan'
    };

    dom.trackResultArea.classList.remove('hidden');
    dom.trackResultArea.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <span style="font-size: 0.8rem; color: #64748b; font-weight: 700;">NOMBOR GILIRAN</span>
        <div style="font-size: 2.8rem; font-weight: 900; color: #c2410c; margin: 4px 0;">${data.queue_number}</div>
        <div style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-bottom: 8px;">
          ${statusLabels[data.status] || data.status}
        </div>
        <p style="font-size: 0.85rem; color: #64748b;">Jenis: ${data.order_type === 'takeaway' ? 'Bungkus' : 'Makan Sini'} | Jumlah: ${formatRM(data.total_price)}</p>
      </div>
    `;
  } catch (err) {
    dom.trackResultArea.classList.remove('hidden');
    dom.trackResultArea.innerHTML = `<p style="color: #dc2626;">Ralat: ${err.message}</p>`;
  } finally {
    dom.btnSearchOrder.disabled = false;
    dom.btnSearchOrder.textContent = 'Semak';
  }
}

// Inisialisasi Event Listener
function initEvents() {
  dom.orderTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.orderType = e.target.value;
    });
  });

  dom.btnClearCart.addEventListener('click', () => {
    if (Object.keys(state.cart).length > 0 && confirm('Kosongkan troli?')) {
      clearCart();
    }
  });

  dom.btnCheckout.addEventListener('click', submitOrder);

  dom.btnNewOrder.addEventListener('click', () => {
    dom.orderSuccessModal.classList.add('hidden');
    if (state.activePollingId) clearInterval(state.activePollingId);
    state.activePollingId = null;
  });

  dom.btnCloseModal.addEventListener('click', () => {
    dom.orderSuccessModal.classList.add('hidden');
  });

  dom.btnOpenTracker.addEventListener('click', () => {
    dom.trackModal.classList.remove('hidden');
    dom.trackResultArea.classList.add('hidden');
    dom.inputTrackId.value = '';
  });

  dom.btnCloseTrackModal.addEventListener('click', () => {
    dom.trackModal.classList.add('hidden');
  });

  dom.btnSearchOrder.addEventListener('click', trackOrderById);
  dom.inputTrackId.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') trackOrderById();
  });
}

// Mulakan Aplikasi Kiosk
window.addEventListener('DOMContentLoaded', () => {
  initEvents();
  loadSettings();
  loadMenu();

  // Kemaskini tetapan kedai (buka/tutup) secara berkala
  setInterval(loadSettings, 15000);
});
