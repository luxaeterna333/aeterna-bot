// Единый словарь карт ВЗП: код API -> русское имя/файл.
export const mapFiles = {
  STABCITY: 'Байкерка.png',
  MIRROR_PARK: 'Миррор Парк.png',
  GHETTO_ANTS: 'Муравейник.png',
  WINDFARM: 'Ветряки.png',
  LS_CINEMA: 'Киностудия.png',
  SANDYSHORES: 'Сенди Шорс.png',
  PALETOBAY: 'Палето Бей.png',
  PB_LUMBER: 'Лесопилка.png',
  SS_CONSTRUCTION: 'Биз стройка.png',
  EL_RANCHO_SMALL_OILBASE: 'Малая нефть.png',
  PUERTA_DUMP: 'Мусорка.png',
  ELBURRO: 'Татушка.png',
  NICOLA_PLACE: 'Тупик Миррор.png',
  BANNING_ANGAR: 'Мясо.png',
};

export const cleanCode = (m) => (m || '').replace(/^NEW_[SB]_/, '');

// Код -> русское имя (без .png).
export function mapNameOf(code) {
  const c = cleanCode(code);
  return mapFiles[c] ? mapFiles[c].replace('.png', '') : (code || '—');
}

// Русское имя (или код) -> чистый код карты. Возвращает null если не найдено.
export function codeFromInput(input) {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  // прямой код
  for (const code of Object.keys(mapFiles)) {
    if (code.toLowerCase() === q || cleanCode(code).toLowerCase() === q) return code;
  }
  // по русскому имени
  for (const [code, file] of Object.entries(mapFiles)) {
    const name = file.replace('.png', '').toLowerCase();
    if (name === q || name.includes(q) || q.includes(name)) return code;
  }
  return null;
}
