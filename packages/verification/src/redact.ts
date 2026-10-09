/** Redaksi sebelum teks dikirim ke model mana pun. Urutan penting: pola panjang dulu. */
const RULES: Array<[RegExp, string]> = [
  [/\b\d{16}\b/g, "[NIK]"],
  [/(?:\+62|62|0)8\d{8,12}\b/g, "[TELEPON]"],
  [/\b\d{10,15}\b/g, "[REKENING]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
];

export function redact(text: string): string {
  return RULES.reduce((t, [re, label]) => t.replace(re, label), text);
}
