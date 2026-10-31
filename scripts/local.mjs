// Запуск CRM на своём компьютере без сервера и без установки PostgreSQL.
// База данных запускается встроенная, её файлы лежат в папке пользователя
// (~/crm-data), поэтому при обновлении программы данные не теряются.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, cpSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, networkInterfaces, platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// На Windows папка пользователя часто называется по-русски, а PostgreSQL плохо работает
// с такими путями, поэтому данные храним в общей папке C:\Users\Public\crm-data.
const DATA =
  process.env.CRM_DATA_DIR ||
  (platform() === "win32" ? path.join(process.env.PUBLIC || "C:\\Users\\Public", "crm-data") : path.join(homedir(), "crm-data"));
const PG_DIR = path.join(DATA, "db");
const BACKUPS = path.join(DATA, "backups");
const PORT = Number(process.env.PORT || 3000);
const PG_PORT = Number(process.env.PG_PORT || 54329);
const KEEP_BACKUPS = 14;

const log = (s) => console.log(`\n=> ${s}`);

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: APP, env, stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")}: код ${code}`))));
  });
}

function settings() {
  mkdirSync(DATA, { recursive: true });
  const file = path.join(DATA, "settings.json");
  if (!existsSync(file)) {
    writeFileSync(file, JSON.stringify({ dbPassword: randomBytes(16).toString("hex") }, null, 2));
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Копия базы раз в день, пока она остановлена. Хранятся последние 14. */
function backup() {
  if (!existsSync(path.join(PG_DIR, "PG_VERSION"))) return;
  mkdirSync(BACKUPS, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUPS, today);
  if (!existsSync(target)) {
    log(`Резервная копия базы: ${target}`);
    cpSync(PG_DIR, target, { recursive: true, filter: (src) => !src.endsWith("postmaster.pid") });
  }
  const all = readdirSync(BACKUPS).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) rmSync(path.join(BACKUPS, old), { recursive: true, force: true });
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

function openBrowser(url) {
  const cmd = platform() === "win32" ? "cmd" : platform() === "darwin" ? "open" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const p = spawn(cmd, args, { stdio: "ignore", detached: true });
    p.on("error", () => {});
    p.unref();
  } catch {}
}

const node = process.execPath;
const prismaCli = path.join(APP, "node_modules", "prisma", "build", "index.js");
const nextCli = path.join(APP, "node_modules", "next", "dist", "bin", "next");

const { dbPassword } = settings();
backup();

const pg = new EmbeddedPostgres({ databaseDir: PG_DIR, user: "crm", password: dbPassword, port: PG_PORT, persistent: true, onLog: () => {} });
const firstRun = !existsSync(path.join(PG_DIR, "PG_VERSION"));
if (firstRun) {
  log("Первый запуск: создаю базу данных");
  await pg.initialise();
}
await pg.start();
if (firstRun) await pg.createDatabase("crm");

const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: `postgresql://crm:${dbPassword}@127.0.0.1:${PG_PORT}/crm`,
  // по локальной сети без HTTPS cookie не должны быть secure
  COOKIE_SECURE: "false",
  NEXT_TELEMETRY_DISABLED: "1",
};

let app;
async function shutdown() {
  if (app) app.kill();
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await run(node, [prismaCli, "migrate", "deploy"], env);
  if (!existsSync(path.join(APP, ".next", "BUILD_ID"))) {
    log("Собираю программу. Это нужно один раз после установки или обновления, займёт несколько минут");
    await run(node, [prismaCli, "generate"], env);
    await run(node, [nextCli, "build"], env);
  }
} catch (e) {
  console.error(e);
  await pg.stop().catch(() => {});
  process.exit(1);
}

app = spawn(node, [nextCli, "start", "-H", "0.0.0.0", "-p", String(PORT)], { cwd: APP, env, stdio: "inherit" });
app.on("exit", (code) => {
  if (code) console.error("\nCRM не запустилась. Возможно, она уже открыта в другом окне — закройте его и попробуйте снова.");
  shutdown();
});

setTimeout(() => {
  const local = `http://localhost:${PORT}`;
  console.log("\n==========================================");
  console.log(" CRM работает. Не закрывайте это окно.");
  console.log(` На этом компьютере:  ${local}`);
  for (const ip of lanAddresses()) console.log(` С телефона по Wi-Fi: http://${ip}:${PORT}`);
  console.log(` Данные и копии базы: ${DATA}`);
  console.log("==========================================\n");
  openBrowser(local);
}, 3000);
