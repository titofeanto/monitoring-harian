// Data kecil dan deterministik untuk tes Code.gs.

export const cfg = () => ({
  remark_spm: 'LOCAL SPM', remark_minis: 'TOP 1000 LOCAL MINIS, LOCAL MINIS',
  banded_spm: 0.8, banded_minis: 0.7, fop_weekly: 3, fop_biweekly: 2,
});

export const dmsHeader = () => ['Salesman', 'Outlet', 'SKUCode', 'TotalQuantity(PCS)', 'INVDate'];

export const row = (outlet, sku, qty, iso, sm = 'S1') => [sm, outlet, sku, qty, iso];

// 4 toko: SPM, MINIS, INACTIVE, OTHERS
export const stores = () => [
  { outlet_kode: 'A1', outlet_nama: 'Toko SPM', remark: 'LOCAL SPM', status: 'ACTIVE' },
  { outlet_kode: 'M1', outlet_nama: 'Toko Minis', remark: 'LOCAL MINIS', status: 'ACTIVE' },
  { outlet_kode: 'X1', outlet_nama: 'Toko Mati', remark: 'LOCAL SPM', status: 'INACTIVE' },
  { outlet_kode: 'O1', outlet_nama: 'Toko Lain', remark: 'OTHERS', status: 'ACTIVE' },
];

// SPM: 5 SKU, MINIS: 4 SKU
export const bandedSku = () => [
  ...['P1', 'P2', 'P3', 'P4', 'P5'].map(k => ({ channel: 'SPM', sku_kode: k, sku_nama: 'SKU ' + k })),
  ...['N1', 'N2', 'N3', 'N4'].map(k => ({ channel: 'MINIS', sku_kode: k, sku_nama: 'SKU ' + k })),
];

// Satu toko aktif dipantau (agar tes fokus).
export const oneStore = (outlet_kode, remark = 'LOCAL SPM') =>
  [{ outlet_kode, outlet_nama: 'Toko ' + outlet_kode, remark, status: 'ACTIVE' }];
