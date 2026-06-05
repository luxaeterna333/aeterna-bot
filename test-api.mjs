// Тест: проверяем что API парсится и фильтр работает
const API_URL = 'https://vzp-gta5rp.com/api/events?limit=30&offset=0';

const res = await fetch(API_URL, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
});
console.log('HTTP', res.status);
const events = await res.json();
console.log('Событий получено:', events.length);
console.log('Пример первого события:');
const e = events[0];
console.log('  attacker:', e.attackerName);
console.log('  defender:', e.defenderName);
console.log('  server:', e.serverName);
console.log('  point:', e.pointName);
console.log('  map:', e.map);

// Проверим поиск .aeterna
const found = events.filter(ev =>
  (ev.attackerName ?? '').toLowerCase().includes('.aeterna') ||
  (ev.defenderName ?? '').toLowerCase().includes('.aeterna')
);
console.log('Найдено событий с .aeterna:', found.length);
process.exit(0);
