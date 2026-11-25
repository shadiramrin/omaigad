import { defaultSettings, defaultCategories, sampleMenuItems } from './seed-data.js';

let dbReady = false;

/**
 * 1. Auto-setup jadual & 15 menu contoh dengan cache dbReady
 */
async function ensureDb(env) {
  if (dbReady) return;

  if (!env.DB) {
    throw new Error('D1 binding DB tidak ditemui dalam environment.');
  }

  // Cipta jadual jika belum wujud
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_id TEXT,
      emoji TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_number TEXT NOT NULL,
      order_type TEXT NOT NULL,
      total_price REAL NOT NULL,
      status TEXT DEFAULT 'baru',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Semak & isi settings lalai jika kosong
  const settingsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM settings').first();
  if (!settingsCount || settingsCount.count === 0) {
    const stmts = defaultSettings.map(s => 
      env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(s.key, s.value)
    );
    await env.DB.batch(stmts);
  }

  // Semak & isi categories jika kosong
  const catCount = await env.DB.prepare('SELECT COUNT(*) as count FROM categories').first();
  if (!catCount || catCount.count === 0) {
    const catStmts = defaultCategories.map(c =>
      env.DB.prepare('INSERT INTO categories (id, name, icon, sort_order, is_active) VALUES (?, ?, ?, ?, ?)').bind(
        c.id, c.name, c.icon, c.sort_order, c.is_active
      )
    );
    await env.DB.batch(catStmts);
  }

  // Semak & isi 15 contoh menu jika kosong
  const itemsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM items').first();
  if (!itemsCount || itemsCount.count === 0) {
    const itemStmts = sampleMenuItems.map(m =>
      env.DB.prepare(
        'INSERT INTO items (category_id, name, description, price, emoji, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(m.category_id, m.name, m.description, m.price, m.emoji, m.is_active, m.sort_order)
    );
    await env.DB.batch(itemStmts);
  }

  dbReady = true;
}

// Bantuan respons JSON & CORS
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...headers
    }
  });
}

// Pengesahan Token Admin ringkas berasaskan ADMIN_PASSWORD
async function verifyAdminAuth(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return { errorStatus: 503, message: 'ADMIN_PASSWORD belum diset dalam environment variable Cloudflare Workers.' };
  }
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { errorStatus: 401, message: 'Kebenaran ditolak. Sila log masuk semula.' };
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const expectedToken = await hashPassword(env.ADMIN_PASSWORD);
  if (token !== expectedToken) {
    return { errorStatus: 401, message: 'Sesi log masuk tidak sah atau telah luput.' };
  }
  return { valid: true };
}

async function hashPassword(pass) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`mari-order-admin:${pass}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // Kendali OPTIONS pre-flight CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      // Pastikan DB sentiasa bersedia sebelum memproses API
      if (url.pathname.startsWith('/api/')) {
        await ensureDb(env);
      }

      // ==========================================
      // 1. API AWAM (PUBLIC KIOSK API)
      // ==========================================

      // GET /api/settings - Maklumat kedai & status buka/tutup
      if (url.pathname === '/api/settings' && method === 'GET') {
        const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        for (const row of rows.results || []) {
          settings[row.key] = row.value;
        }
        return jsonResponse(settings);
      }

      // GET /api/categories - Senarai kategori aktif untuk kiosk
      if (url.pathname === '/api/categories' && method === 'GET') {
        const rows = await env.DB.prepare(
          'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        ).all();
        return jsonResponse(rows.results || []);
      }

      // GET /api/menu - Menu lengkap (kategori + item aktif)
      if (url.pathname === '/api/menu' && method === 'GET') {
        const categories = await env.DB.prepare(
          'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        ).all();

        const items = await env.DB.prepare(`
          SELECT i.*, c.name as category_name 
          FROM items i 
          JOIN categories c ON i.category_id = c.id 
          WHERE i.is_active = 1 AND c.is_active = 1 
          ORDER BY i.sort_order ASC, i.id ASC
        `).all();

        return jsonResponse({
          categories: categories.results || [],
          items: items.results || []
        });
      }

      // POST /api/orders - Hantar Pesanan Kiosk (Peraturan #2)
      if (url.pathname === '/api/orders' && method === 'POST') {
        // Semak status kedai dibuka
        const openSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'is_open'").first();
        if (openSetting && openSetting.value === '0') {
          return jsonResponse({
            error: 'Maaf, kedai sedang ditutup buat masa ini. Pesanan tidak dapat diterima.'
          }, 400);
        }

        const body = await request.json();
        const { order_type, items, notes } = body;

        if (!order_type || (order_type !== 'dine_in' && order_type !== 'takeaway')) {
          return jsonResponse({ error: 'Sila pilih jenis pesanan: Makan Sini atau Bungkus.' }, 400);
        }

        if (!Array.isArray(items) || items.length === 0) {
          return jsonResponse({ error: 'Troli pesanan anda kosong.' }, 400);
        }

        // Semak item dan kira jumlah harga di SERVER
        const itemIds = items.map(it => parseInt(it.id)).filter(id => !isNaN(id) && id > 0);
        if (itemIds.length === 0) {
          return jsonResponse({ error: 'Item dalam troli tidak sah.' }, 400);
        }

        const placeholders = itemIds.map(() => '?').join(',');
        const dbItemsRes = await env.DB.prepare(
          `SELECT id, name, price, is_active FROM items WHERE id IN (${placeholders})`
        ).bind(...itemIds).all();

        const dbItemMap = new Map((dbItemsRes.results || []).map(it => [it.id, it]));

        let calculatedTotal = 0;
        const validOrderItems = [];

        for (const it of items) {
          const dbItem = dbItemMap.get(parseInt(it.id));
          if (!dbItem) {
            return jsonResponse({ error: `Item (ID: ${it.id}) tidak ditemui dalam sistem.` }, 400);
          }
          if (dbItem.is_active !== 1) {
            return jsonResponse({ error: `Item "${dbItem.name}" telah dinyahaktifkan.` }, 400);
          }
          const quantity = Math.max(1, parseInt(it.quantity) || 1);
          const subtotal = Math.round(dbItem.price * quantity * 100) / 100;
          calculatedTotal += subtotal;

          validOrderItems.push({
            item_id: dbItem.id,
            item_name: dbItem.name,
            unit_price: dbItem.price,
            quantity: quantity,
            subtotal: subtotal
          });
        }

        calculatedTotal = Math.round(calculatedTotal * 100) / 100;

        // Cipta rekod pesanan awal untuk dapatkan orderId
        const insertOrderRes = await env.DB.prepare(
          "INSERT INTO orders (queue_number, order_type, total_price, status, notes) VALUES (?, ?, ?, 'baru', ?) RETURNING id"
        ).bind('DRAFT', order_type, calculatedTotal, notes || '').first();

        const orderId = insertOrderRes.id;

        // Jana nombor giliran berjujukan strictly daripada orderId (Peraturan #2)
        const queueNumber = `A-${String(orderId).padStart(3, '0')}`;

        // Simpan order_items menggunakan db.batch() bersama kemaskini queue_number (Peraturan #2)
        const batchStatements = [
          env.DB.prepare('UPDATE orders SET queue_number = ? WHERE id = ?').bind(queueNumber, orderId),
          ...validOrderItems.map(vi =>
            env.DB.prepare(
              'INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(orderId, vi.item_id, vi.item_name, vi.unit_price, vi.quantity, vi.subtotal)
          )
        ];

        await env.DB.batch(batchStatements);

        return jsonResponse({
          success: true,
          order_id: orderId,
          queue_number: queueNumber,
          order_type,
          total_price: calculatedTotal,
          status: 'baru',
          created_at: new Date().toISOString()
        }, 201);
      }

      // GET /api/orders/:id/status - Status langsung pesanan untuk kiosk
      if (url.pathname.startsWith('/api/orders/') && url.pathname.endsWith('/status') && method === 'GET') {
        const parts = url.pathname.split('/');
        const id = parseInt(parts[3]);
        if (isNaN(id)) return jsonResponse({ error: 'ID pesanan tidak sah.' }, 400);

        const order = await env.DB.prepare(
          'SELECT id, queue_number, order_type, total_price, status, notes, created_at, updated_at FROM orders WHERE id = ?'
        ).bind(id).first();

        if (!order) return jsonResponse({ error: 'Pesanan tidak ditemui.' }, 404);

        const items = await env.DB.prepare(
          'SELECT item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = ?'
        ).bind(id).all();

        return jsonResponse({
          ...order,
          items: items.results || []
        });
      }

      // GET /api/images/:id - Baca gambar dari D1 dengan Uint8Array.from (Peraturan #3)
      if (url.pathname.startsWith('/api/images/') && method === 'GET') {
        const id = url.pathname.replace('/api/images/', '').trim();
        if (!id) return new Response('ID Gambar Diperlukan', { status: 400 });

        const row = await env.DB.prepare('SELECT mime_type, data FROM images WHERE id = ?').bind(id).first();
        if (!row || !row.data) {
          return new Response('Gambar Tidak Ditemui', { status: 404 });
        }

        // Sesuai dengan Peraturan #3: Uint8Array.from(row.data || []) supaya tidak broken image
        const bytes = Uint8Array.from(row.data || []);

        return new Response(bytes, {
          headers: {
            'Content-Type': row.mime_type || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        });
      }

      // ==========================================
      // 2. API ADMIN & CMS (/api/admin/*)
      // ==========================================

      // GET /api/admin/auth-status - Semak status konfigurasi ADMIN_PASSWORD
      if (url.pathname === '/api/admin/auth-status' && method === 'GET') {
        if (!env.ADMIN_PASSWORD) {
          return jsonResponse({
            configured: false,
            message: 'ADMIN_PASSWORD belum diset dalam persekitaran Cloudflare Workers.'
          }, 503);
        }
        return jsonResponse({ configured: true });
      }

      // POST /api/admin/login - Log masuk admin
      if (url.pathname === '/api/admin/login' && method === 'POST') {
        if (!env.ADMIN_PASSWORD) {
          return jsonResponse({
            error: 'ADMIN_PASSWORD belum diset dalam environment variable Cloudflare Workers (503).'
          }, 503);
        }

        const body = await request.json().catch(() => ({}));
        const { password } = body;

        if (!password || password !== env.ADMIN_PASSWORD) {
          return jsonResponse({ error: 'Kata laluan admin salah. Sila cuba lagi.' }, 401);
        }

        const token = await hashPassword(env.ADMIN_PASSWORD);
        return jsonResponse({
          success: true,
          token,
          message: 'Berjaya log masuk.'
        });
      }

      // Laluan di bawah mewajibkan pengesahan Admin
      if (url.pathname.startsWith('/api/admin/')) {
        const auth = await verifyAdminAuth(request, env);
        if (auth.errorStatus) {
          return jsonResponse({ error: auth.message }, auth.errorStatus);
        }

        // --- URUS PESANAN DAPUR ---
        // GET /api/admin/orders - Senarai pesanan dapur (boleh filter status)
        if (url.pathname === '/api/admin/orders' && method === 'GET') {
          const statusFilter = url.searchParams.get('status');
          let ordersQuery = 'SELECT * FROM orders ';
          const queryParams = [];

          if (statusFilter && statusFilter !== 'semua') {
            ordersQuery += 'WHERE status = ? ';
            queryParams.push(statusFilter);
          }

          ordersQuery += 'ORDER BY id DESC LIMIT 100';

          const ordersRes = queryParams.length > 0
            ? await env.DB.prepare(ordersQuery).bind(...queryParams).all()
            : await env.DB.prepare(ordersQuery).all();

          const orders = ordersRes.results || [];

          // Ambil items untuk setiap order
          if (orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            const placeholders = orderIds.map(() => '?').join(',');
            const itemsRes = await env.DB.prepare(
              `SELECT order_id, item_name, unit_price, quantity, subtotal FROM order_items WHERE order_id IN (${placeholders})`
            ).bind(...orderIds).all();

            const itemsMap = new Map();
            for (const it of itemsRes.results || []) {
              if (!itemsMap.has(it.order_id)) itemsMap.set(it.order_id, []);
              itemsMap.get(it.order_id).push(it);
            }

            for (const order of orders) {
              order.items = itemsMap.get(order.id) || [];
            }
          }

          return jsonResponse(orders);
        }

        // POST /api/admin/orders/:id/status - Tukar status pesanan dapur
        if (url.pathname.match(/^\/api\/admin\/orders\/\d+\/status$/) && method === 'POST') {
          const parts = url.pathname.split('/');
          const id = parseInt(parts[4]);
          const body = await request.json().catch(() => ({}));
          const { status } = body;

          const validStatuses = ['baru', 'disediakan', 'selesai', 'batal'];
          if (!validStatuses.includes(status)) {
            return jsonResponse({ error: 'Status tidak sah. Pilih: baru, disediakan, selesai, batal' }, 400);
          }

          await env.DB.prepare(
            'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(status, id).run();

          return jsonResponse({ success: true, id, status });
        }

        // --- URUS ITEM MENU ---
        // GET /api/admin/items - Semua item menu termasuk yang tidak aktif
        if (url.pathname === '/api/admin/items' && method === 'GET') {
          const rows = await env.DB.prepare(`
            SELECT i.*, c.name as category_name 
            FROM items i 
            JOIN categories c ON i.category_id = c.id 
            ORDER BY c.sort_order ASC, i.sort_order ASC, i.id ASC
          `).all();
          return jsonResponse(rows.results || []);
        }

        // POST /api/admin/items - Tambah item menu baru
        if (url.pathname === '/api/admin/items' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const { category_id, name, description, price, emoji, image_id, is_active } = body;

          if (!name || !name.trim()) return jsonResponse({ error: 'Nama item diperlukan.' }, 400);
          if (isNaN(parseFloat(price)) || parseFloat(price) < 0) return jsonResponse({ error: 'Harga tidak sah.' }, 400);
          if (!category_id) return jsonResponse({ error: 'Sila pilih kategori.' }, 400);

          const maxSort = await env.DB.prepare(
            'SELECT MAX(sort_order) as max_sort FROM items WHERE category_id = ?'
          ).bind(category_id).first();
          const nextSort = (maxSort?.max_sort || 0) + 1;

          const res = await env.DB.prepare(`
            INSERT INTO items (category_id, name, description, price, emoji, image_id, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
          `).bind(
            category_id,
            name.trim(),
            description || '',
            parseFloat(price),
            emoji || '🍽️',
            image_id || '',
            is_active !== undefined ? (is_active ? 1 : 0) : 1,
            nextSort
          ).first();

          return jsonResponse({ success: true, id: res.id }, 201);
        }

        // PUT /api/admin/items/:id - Edit item menu
        if (url.pathname.match(/^\/api\/admin\/items\/\d+$/) && method === 'PUT') {
          const id = parseInt(url.pathname.split('/')[4]);
          const body = await request.json().catch(() => ({}));
          const { category_id, name, description, price, emoji, image_id, is_active } = body;

          if (!name || !name.trim()) return jsonResponse({ error: 'Nama item diperlukan.' }, 400);
          if (isNaN(parseFloat(price)) || parseFloat(price) < 0) return jsonResponse({ error: 'Harga tidak sah.' }, 400);

          await env.DB.prepare(`
            UPDATE items 
            SET category_id = ?, name = ?, description = ?, price = ?, emoji = ?, image_id = ?, is_active = ?
            WHERE id = ?
          `).bind(
            category_id,
            name.trim(),
            description || '',
            parseFloat(price),
            emoji || '🍽️',
            image_id || '',
            is_active ? 1 : 0,
            id
          ).run();

          return jsonResponse({ success: true, id });
        }

        // PATCH /api/admin/items/:id/price - Tukar harga cepat
        if (url.pathname.match(/^\/api\/admin\/items\/\d+\/price$/) && method === 'PATCH') {
          const id = parseInt(url.pathname.split('/')[4]);
          const body = await request.json().catch(() => ({}));
          const price = parseFloat(body.price);

          if (isNaN(price) || price < 0) return jsonResponse({ error: 'Harga tidak sah.' }, 400);

          await env.DB.prepare('UPDATE items SET price = ? WHERE id = ?').bind(price, id).run();
          return jsonResponse({ success: true, id, price });
        }

        // PATCH /api/admin/items/:id/toggle - Aktif / Nyahaktif item cepat
        if (url.pathname.match(/^\/api\/admin\/items\/\d+\/toggle$/) && method === 'PATCH') {
          const id = parseInt(url.pathname.split('/')[4]);
          const item = await env.DB.prepare('SELECT is_active FROM items WHERE id = ?').bind(id).first();
          if (!item) return jsonResponse({ error: 'Item tidak ditemui.' }, 404);

          const newStatus = item.is_active === 1 ? 0 : 1;
          await env.DB.prepare('UPDATE items SET is_active = ? WHERE id = ?').bind(newStatus, id).run();
          return jsonResponse({ success: true, id, is_active: newStatus });
        }

        // POST /api/admin/items/:id/duplicate - Salin item menu
        if (url.pathname.match(/^\/api\/admin\/items\/\d+\/duplicate$/) && method === 'POST') {
          const id = parseInt(url.pathname.split('/')[4]);
          const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
          if (!item) return jsonResponse({ error: 'Item asal tidak ditemui.' }, 404);

          const newName = `${item.name} (Salinan)`;
          const res = await env.DB.prepare(`
            INSERT INTO items (category_id, name, description, price, emoji, image_id, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
          `).bind(
            item.category_id,
            newName,
            item.description,
            item.price,
            item.emoji,
            item.image_id,
            item.is_active,
            item.sort_order + 1
          ).first();

          return jsonResponse({ success: true, id: res.id, name: newName });
        }

        // DELETE /api/admin/items/:id - Padam item
        if (url.pathname.match(/^\/api\/admin\/items\/\d+$/) && method === 'DELETE') {
          const id = parseInt(url.pathname.split('/')[4]);
          await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
          return jsonResponse({ success: true, id });
        }

        // --- URUS KATEGORI ---
        // GET /api/admin/categories - Semua kategori dengan bilangan item
        if (url.pathname === '/api/admin/categories' && method === 'GET') {
          const rows = await env.DB.prepare(`
            SELECT c.*, COUNT(i.id) as item_count 
            FROM categories c 
            LEFT JOIN items i ON c.id = i.category_id 
            GROUP BY c.id 
            ORDER BY c.sort_order ASC, c.id ASC
          `).all();
          return jsonResponse(rows.results || []);
        }

        // POST /api/admin/categories - Tambah kategori
        if (url.pathname === '/api/admin/categories' && method === 'POST') {
          const body = await request.json().catch(() => ({}));
          const { name, icon, sort_order } = body;
          if (!name || !name.trim()) return jsonResponse({ error: 'Nama kategori diperlukan.' }, 400);

          const res = await env.DB.prepare(
            'INSERT INTO categories (name, icon, sort_order, is_active) VALUES (?, ?, ?, 1) RETURNING id'
          ).bind(name.trim(), icon || '📁', parseInt(sort_order) || 0).first();

          return jsonResponse({ success: true, id: res.id }, 201);
        }

        // PUT /api/admin/categories/:id - Kemaskini kategori
        if (url.pathname.match(/^\/api\/admin\/categories\/\d+$/) && method === 'PUT') {
          const id = parseInt(url.pathname.split('/')[4]);
          const body = await request.json().catch(() => ({}));
          const { name, icon, sort_order, is_active } = body;

          if (!name || !name.trim()) return jsonResponse({ error: 'Nama kategori diperlukan.' }, 400);

          await env.DB.prepare(
            'UPDATE categories SET name = ?, icon = ?, sort_order = ?, is_active = ? WHERE id = ?'
          ).bind(name.trim(), icon || '📁', parseInt(sort_order) || 0, is_active ? 1 : 0, id).run();

          return jsonResponse({ success: true, id });
        }

        // PATCH /api/admin/categories/:id/toggle - Tukar status aktif kategori
        if (url.pathname.match(/^\/api\/admin\/categories\/\d+\/toggle$/) && method === 'PATCH') {
          const id = parseInt(url.pathname.split('/')[4]);
          const cat = await env.DB.prepare('SELECT is_active FROM categories WHERE id = ?').bind(id).first();
          if (!cat) return jsonResponse({ error: 'Kategori tidak ditemui.' }, 404);

          const newStatus = cat.is_active === 1 ? 0 : 1;
          await env.DB.prepare('UPDATE categories SET is_active = ? WHERE id = ?').bind(newStatus, id).run();
          return jsonResponse({ success: true, id, is_active: newStatus });
        }

        // DELETE /api/admin/categories/:id - Padam kategori (SEKAT DENGAN 409 JIKA MASIH ADA ITEM)
        if (url.pathname.match(/^\/api\/admin\/categories\/\d+$/) && method === 'DELETE') {
          const id = parseInt(url.pathname.split('/')[4]);

          // Semak sama ada masih ada item di bawah kategori ini
          const countRow = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM items WHERE category_id = ?'
          ).bind(id).first();

          const count = countRow?.count || 0;
          if (count > 0) {
            return jsonResponse({
              error: `Kategori ini tidak boleh dipadam kerana masih mempunyai ${count} item menu. Sila padam atau pindahkan item tersebut terlebih dahulu.`
            }, 409);
          }

          await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
          return jsonResponse({ success: true, id });
        }

        // --- MUAT NAIK GAMBAR KE D1 (Peraturan #3) ---
        // POST /api/admin/images - Simpan gambar ke D1 sebagai ArrayBuffer
        if (url.pathname === '/api/admin/images' && method === 'POST') {
          const formData = await request.formData();
          const file = formData.get('image');
          if (!file || typeof file === 'string') {
            return jsonResponse({ error: 'Tiada fail gambar yang sah dihantar.' }, 400);
          }

          const arrayBuffer = await file.arrayBuffer();
          if (arrayBuffer.byteLength > 100 * 1024) {
            return jsonResponse({ error: 'Saiz gambar melebihi had (maksimum < 95 KB selepas dimampatkan).' }, 400);
          }

          const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
          const mimeType = file.type || 'image/jpeg';

          // Simpan ke D1 sebagai ArrayBuffer (bytes.buffer)
          await env.DB.prepare(
            'INSERT INTO images (id, mime_type, data) VALUES (?, ?, ?)'
          ).bind(imageId, mimeType, arrayBuffer).run();

          return jsonResponse({
            success: true,
            id: imageId,
            url: `/api/images/${imageId}`
          }, 201);
        }

        // --- TETAPAN KEDAI ---
        // GET /api/admin/settings - Ambil tetapan
        if (url.pathname === '/api/admin/settings' && method === 'GET') {
          const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
          const settings = {};
          for (const row of rows.results || []) {
            settings[row.key] = row.value;
          }
          return jsonResponse(settings);
        }

        // PUT /api/admin/settings - Kemaskini tetapan kedai (Nama, Banner, Buka/Tutup)
        if (url.pathname === '/api/admin/settings' && method === 'PUT') {
          const body = await request.json().catch(() => ({}));
          const allowedKeys = ['store_name', 'store_banner_text', 'store_banner_image_id', 'is_open', 'currency'];

          const stmts = [];
          for (const key of allowedKeys) {
            if (body[key] !== undefined) {
              stmts.push(
                env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, String(body[key]))
              );
            }
          }

          if (stmts.length > 0) {
            await env.DB.batch(stmts);
          }

          return jsonResponse({ success: true, message: 'Tetapan kedai berjaya dikemaskini.' });
        }
      }

      // ==========================================
      // 3. STATIK ASET (WORKERS ASSETS / PAGES FALLBACK)
      // ==========================================
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      // Jika assets binding tiada, arahkan root ke /index.html
      return new Response('Sistem Mari Order Workers aktif. Sila pasangkan [assets] atau semak konfigurasi.', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    } catch (err) {
      console.error('Ralat dalam Mari Order Worker:', err);
      return jsonResponse({
        error: 'Ralat dalam pelayan: ' + (err.message || String(err))
      }, 500);
    }
  }
};
