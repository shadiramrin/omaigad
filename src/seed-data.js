// Data contoh & tetapan awal Mari Order

export const defaultSettings = [
  { key: 'store_name', value: 'Mari Order' },
  { key: 'store_banner_text', value: 'Selamat Datang ke Mari Order! Nikmati masakan panas, sedap & segar setiap hari.' },
  { key: 'store_banner_image_id', value: '' },
  { key: 'is_open', value: '1' },
  { key: 'currency', value: 'RM' }
];

export const defaultCategories = [
  { id: 1, name: 'Makanan Utama', icon: '🍛', sort_order: 1, is_active: 1 },
  { id: 2, name: 'Minuman', icon: '🥤', sort_order: 2, is_active: 1 },
  { id: 3, name: 'Sampingan', icon: '🥟', sort_order: 3, is_active: 1 },
  { id: 4, name: 'Pencuci Mulut', icon: '🍧', sort_order: 4, is_active: 1 }
];

export const sampleMenuItems = [
  {
    category_id: 1,
    name: 'Nasi Lemak Ayam Berempah',
    description: 'Nasi lemak wangi bersantan, ayam goreng berempah garing, telur rebus, sambal istimewa, kacang & ikan bilis.',
    price: 12.90,
    emoji: '🍗',
    is_active: 1,
    sort_order: 1
  },
  {
    category_id: 1,
    name: 'Nasi Goreng Kampung',
    description: 'Nasi goreng kampung beraroma wangi kangkung segar, cili padi kampung, ikan bilis rangup dan telur mata.',
    price: 9.50,
    emoji: '🍳',
    is_active: 1,
    sort_order: 2
  },
  {
    category_id: 1,
    name: 'Mee Goreng Mamak Special',
    description: 'Mee kuning digoreng basah berperisa mamak dengan cucur udang, tauhu, taugeh, telur dan perahan limau.',
    price: 8.50,
    emoji: '🍝',
    is_active: 1,
    sort_order: 3
  },
  {
    category_id: 1,
    name: 'Roti Canai Banjir Special',
    description: '2 keping roti canai garing dicarik banjir kuah dhal, kari ayam, sambal pedas & 2 biji telur goyang.',
    price: 5.50,
    emoji: '🫓',
    is_active: 1,
    sort_order: 4
  },
  {
    category_id: 1,
    name: 'Satay Ayam Tradisi (6 Cucuk)',
    description: 'Satay ayam perapan rempah ratus asli dibakar arang, disajikan bersama timun, bawang & kuah kacang pekat.',
    price: 11.00,
    emoji: '🍢',
    is_active: 1,
    sort_order: 5
  },
  {
    category_id: 1,
    name: 'Laksa Penang Kaw',
    description: 'Laksa beras lembut dalam kuah asam ikan kembung pekat beraroma daun kesum, bunga kantan dan petis udang.',
    price: 10.50,
    emoji: '🍜',
    is_active: 1,
    sort_order: 6
  },
  {
    category_id: 1,
    name: 'Bihun Sup Daging Istimewa',
    description: 'Bihun lembut bersama hirisan daging lembu empuk dalam sup herba wangi, bawang goreng dan cili kicap padu.',
    price: 10.00,
    emoji: '🍲',
    is_active: 1,
    sort_order: 7
  },
  {
    category_id: 1,
    name: 'Char Kuey Teow Kerang & Udang',
    description: 'Kuey teow goreng panas dengan aroma kuali wok hei asli, udang segar, kerang manis, taugeh dan telur.',
    price: 9.90,
    emoji: '🍤',
    is_active: 1,
    sort_order: 8
  },
  {
    category_id: 2,
    name: 'Teh Tarik Kaw Buih Melimpah',
    description: 'Teh wangi pekat berkrim ditarik tinggi sehingga berbuih halus dan beraroma harum.',
    price: 3.50,
    emoji: '🧋',
    is_active: 1,
    sort_order: 9
  },
  {
    category_id: 2,
    name: 'Kopi O Ais Kampung',
    description: 'Kopi hitam tradisional kampung dibancuh pekat menyengat dan disajikan berais sejuk nyaman.',
    price: 3.00,
    emoji: '☕',
    is_active: 1,
    sort_order: 10
  },
  {
    category_id: 2,
    name: 'Sirap Bandung Cincau Ais',
    description: 'Minuman sirap ros manis berkrim susu bersama hirisan cincau hitam lembut yang menyejukkan.',
    price: 4.50,
    emoji: '🍧',
    is_active: 1,
    sort_order: 11
  },
  {
    category_id: 2,
    name: 'Milo Ais Dinosaur Tabur',
    description: 'Milo pekat berais dengan timbunan serbuk coklat Milo asli melimpah di atas.',
    price: 4.90,
    emoji: '🍫',
    is_active: 1,
    sort_order: 12
  },
  {
    category_id: 3,
    name: 'Pisang Goreng Crispy Sambal Kicap',
    description: 'Pisang raja bersalut tepung rangup keemasan, dihidang panas bersama sambal kicap pedas Johor.',
    price: 5.00,
    emoji: '🍌',
    is_active: 1,
    sort_order: 13
  },
  {
    category_id: 3,
    name: 'Karipap Pusing Inti Padat (3 Biji)',
    description: 'Karipap berpusar rangup berintikan kentang berempah kari wangi dan isi ayam padat.',
    price: 4.50,
    emoji: '🥟',
    is_active: 1,
    sort_order: 14
  },
  {
    category_id: 4,
    name: 'Cendol Durian Santan Sawit',
    description: 'Cendol pandan hijau kenyal, kacang merah, gula melaka asli, santan pekat dan seulas durian segar.',
    price: 7.50,
    emoji: '🍨',
    is_active: 1,
    sort_order: 15
  }
];
