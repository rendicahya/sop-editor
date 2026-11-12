// Penghubung tautan Keterkaitan antara isian halaman dan App (App mendaftarkan penanganannya).
const handlers = { open: async () => {}, pick: async () => null };

export const connectLinks = (h) => Object.assign(handlers, h);

/** Membuka SOP Pustaka Daring `id` di tab (atau pindah ke tabnya bila sudah terbuka). */
export const openLinkedSop = (id) => handlers.open(id);

/** Dialog pemilihan SOP; hasilnya SOP yang dipilih ({ id, title, … }) atau null. `current`: id yang sedang tertaut. */
export const pickSop = (current = null) => handlers.pick(current);
