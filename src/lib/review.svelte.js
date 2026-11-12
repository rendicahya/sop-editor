// Pengingat tinjauan berkala: SOP yang sudah berlaku lebih dari sekian tahun sejak tanggal efektif (atau tanggal
// revisi terakhir, bila lebih baru) ditandai "perlu ditinjau". Jangka waktunya diingat per browser.
import { todayIso } from './model.js';

const KEY = 'sop-editor.reviewYears';
export const REVIEW_CHOICES = [1, 2, 3, 4, 5];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function load() {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (REVIEW_CHOICES.includes(v)) return v;
  } catch {}
  return 2;
}

export const review = $state({ years: load() });

export function setReviewYears(v) {
  if (!REVIEW_CHOICES.includes(v)) return;
  review.years = v;
  try {
    localStorage.setItem(KEY, String(v));
  } catch {}
}

/** Tanggal acuan tinjauan (ISO): tanggal revisi bila lebih baru dari tanggal efektif. '' bila tidak ada. */
export function reviewSince(header) {
  return [header?.tglEfektif, header?.tglRevisi].filter((d) => ISO.test(d ?? '')).sort().at(-1) ?? '';
}

/** Tanggal jatuh tempo tinjauan (ISO) dari tanggal acuan, atau '' bila tidak ada. */
export function reviewDue(since, years = review.years) {
  return since ? `${Number(since.slice(0, 4)) + years}${since.slice(4)}` : '';
}

/** true bila tanggal acuan sudah lewat `years` tahun. */
export const isReviewDue = (since, years = review.years, today = todayIso()) => !!since && reviewDue(since, years) <= today;
