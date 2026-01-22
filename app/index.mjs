import express from "express";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// --- estáticos
app.use("/static", express.static(path.join(__dirname, "public"), { maxAge: "7d", etag: true }));

// --- plantilla HTML
const templatePath = path.join(__dirname, "views", "index.html");
const BASE_HTML = fs.readFileSync(templatePath, "utf8");

// --- dónde está el JSON
const APPS_JSON = process.env.APPS_JSON || path.join(__dirname, "..", "config", "apps.json");

// --- defaults
const DEFAULT_APPS = [
  { name: "Code Server", path: "/code/",     img: "/static/apps/code.svg" },
  { name: "Portainer",   path: "/portainer/", img: "/static/apps/portainer.svg" }
];

// --- util: leer JSON seguro
function readAppsJson() {
  try {
    const raw = fs.readFileSync(APPS_JSON, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("apps.json debe ser un array");
    // saneado mínimo
    return data
      .map(x => ({
        name: String(x.name || "").trim(),
        path: String(x.path || "").trim(),
        img:  String(x.img || "").trim()
      }))
      .filter(x => x.name && x.path)
      .map(x => ({ ...x, path: x.path.endsWith("/") ? x.path : x.path + "/" }));
  } catch (e) {
    // fallback
    return DEFAULT_APPS;
  }
}

// --- health y demo API
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/hello", (_req, res) => res.json({ message: "Hello from Node!" }));

// --- API para consultar las apps actuales
app.get("/api/apps", (_req, res) => {
  res.json(readAppsJson());
});

// --- Home
app.get("/", (_req, res) => {
  const APPS = readAppsJson();
  const cards = APPS.map(({ name, path, img }) => `
    <a class="card" href="${path}">
      <img class="card-img" src="${img || "/static/apps/generic.svg"}" alt="${name}" loading="lazy" />
      <div class="card-title">${name}</div>
      <div class="card-path">${path}</div>
    </a>
  `).join("");

  const html = BASE_HTML.replace("{{CARDS}}", cards);
  res.set("Content-Type", "text/html; charset=utf-8").send(html);
});

app.listen(PORT, HOST, () => {
  console.log(`Node escuchando en http://${HOST}:${PORT} (apps desde ${APPS_JSON})`);
});
