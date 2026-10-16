import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { loadFonts } from './lib/fonts.js';

const target = document.getElementById('app');

// Font dokumen harus siap sebelum tata letak pertama dihitung (untuk jsPDF dan pratinjau SVG).
Promise.all([
  loadFonts(import.meta.env.BASE_URL),
  document.fonts.load('10px Carlito'),
  document.fonts.load('bold 10px Carlito')
])
  .then(() => mount(App, { target }))
  .catch((e) => {
    target.textContent = 'Gagal memuat aplikasi: ' + e.message;
  });
