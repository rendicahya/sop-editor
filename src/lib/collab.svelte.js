// Kolaborasi real-time: dokumen disinkronkan lewat Yjs (CRDT) antar-browser secara peer-to-peer (WebRTC).
// Browser saling menemukan lewat relay Nostr publik (Trystero), lalu data mengalir langsung antar-peserta.
// Tautan ruang berisi id ruang + kunci; kunci mengenkripsi pesan pencarian peer sehingga hanya pemegang tautan yang bisa bergabung.
// Modul ini hanya memegang state; mesin sinkronisasinya (collabSession.js) dimuat saat pertama kali masuk ruang.

const USER_KEY = 'sop-editor:user';
const ROOMS_KEY = 'sop-editor:rooms';
const COLORS = ['#d92d20', '#dc6803', '#039855', '#0086c9', '#7a5af8', '#c11574', '#4e5ba6', '#027a48'];

export const collab = $state({
  /** off | connecting (menunggu isi dokumen dari peserta lain) | ready */
  status: 'off',
  room: null,
  online: false,
  peers: [],
  me: loadUser(),
  canUndo: false,
  canRedo: false
});

let session = null;
let attempts = 0; // naik setiap masuk/keluar ruang, untuk membatalkan pemuatan modul yang sudah usang

function loadUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY));
    if (u?.name) return u;
  } catch {
    // abaikan
  }
  return { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)] };
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // abaikan
  }
}

function knownRooms() {
  try {
    return JSON.parse(localStorage.getItem(ROOMS_KEY)) ?? [];
  } catch {
    return [];
  }
}

function randomId(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Membaca undangan dari URL (#room=…&key=…). */
export function inviteFromUrl() {
  const p = new URLSearchParams(location.hash.slice(1));
  const room = p.get('room');
  const key = p.get('key');
  return room && key ? { room, key, known: knownRooms().includes(room) } : null;
}

export function roomLink() {
  return collab.room ? `${location.origin}${location.pathname}#room=${collab.room.id}&key=${collab.room.key}` : '';
}

export function setName(name) {
  collab.me = { ...collab.me, name: name.trim() };
  saveJson(USER_KEY, collab.me);
  session?.setUser(collab.me);
}

/** Membuat ruang baru dengan dokumen yang sedang terbuka sebagai isinya. */
export function createRoom() {
  return connect({ id: randomId(9), key: randomId(18) }, true);
}

/** Bergabung ke ruang; dokumen lokal diganti dengan dokumen ruang setelah tersinkron. */
export function joinRoom(invite) {
  return connect({ id: invite.room, key: invite.key }, false);
}

async function connect(room, seed) {
  leaveRoom();
  collab.room = room;
  collab.status = 'connecting';
  history.replaceState(null, '', `#room=${room.id}&key=${room.key}`);
  saveJson(ROOMS_KEY, [room.id, ...knownRooms().filter((r) => r !== room.id)].slice(0, 30));

  const attempt = ++attempts;
  let startSession;
  try {
    ({ startSession } = await import('./collabSession.js'));
  } catch {
    if (attempt !== attempts) return;
    leaveRoom();
    alert('Modul kolaborasi gagal dimuat. Periksa koneksi internet lalu coba lagi.');
    return;
  }
  if (attempt !== attempts) return; // ruang ditinggalkan/diganti selama modul dimuat
  session = startSession(room, seed);
}

/** Mengisi ruang dengan dokumen lokal (pembuat ruang, atau bila tidak ada peserta lain yang memegang dokumennya). */
export function useLocalDocument() {
  session?.useLocalDocument();
}

export function leaveRoom() {
  attempts++;
  session?.leave();
  session = null;
  Object.assign(collab, { status: 'off', room: null, online: false, peers: [], canUndo: false, canRedo: false });
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

/** Dipanggil setiap dokumen lokal berubah: kirim selisihnya ke ruang. */
export function pushLocal(doc) {
  if (collab.status === 'ready') session?.push(doc);
}

export function undo() {
  session?.undo();
}

export function redo() {
  session?.redo();
}

/** Perubahan lokal berikutnya menjadi langkah undo tersendiri. */
export function stopCapturing() {
  session?.stopCapturing();
}

/** Memberi tahu peserta lain bagian mana yang sedang kita edit. */
export function setFocus(focus) {
  session?.setFocus(focus);
}
