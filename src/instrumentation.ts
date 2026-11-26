// Часовой пояс мастерской. Все даты в CRM показываются и вводятся в этом поясе.
// По умолчанию Екатеринбургское время (UTC+5, Башкортостан); поменять можно переменной TZ в .env.
export function register() {
  if (!process.env.TZ) process.env.TZ = "Asia/Yekaterinburg";
}
