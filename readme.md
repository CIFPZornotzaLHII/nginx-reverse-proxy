# 🔀 Práctica: reverse proxy con nginx y Docker

En esta práctica vas a montar un **reverse proxy**: un único nginx que recibe todas las peticiones en el puerto 80 y las reparte entre varios servicios. Puede repartirlas de dos formas: **por ruta** (`localhost/code/`, `localhost/portainer/`…) o **por subdominio** (`code.localhost`, `kuma.localhost`…), y las dos se pueden combinar en el mismo proxy. Es lo que hay delante de casi cualquier servidor real.

Partes de un entorno que ya funciona (el proxy, un portal de inicio, code-server y Portainer) y lo vas ampliando con nuevos servicios, tarea a tarea.

**Índice**

- [🎯 Qué vas a hacer](#-qué-vas-a-hacer)
- [🧠 Conceptos](#-conceptos)
  - [¿Qué es un reverse proxy?](#qué-es-un-reverse-proxy)
  - [Arquitectura de la práctica](#arquitectura-de-la-práctica)
  - [El `docker-compose.yml`](#el-docker-composeyml)
  - [El `nginx.conf`](#el-nginxconf)
  - [Rutas o subdominios: dos formas de repartir](#rutas-o-subdominios-dos-formas-de-repartir)
- [🛠️ Tareas](#️-tareas)
  - [Tarea 1 · Arranca el entorno y explóralo](#tarea-1--arranca-el-entorno-y-explóralo)
  - [Tarea 2 · Tu primer servicio: whoami](#tarea-2--tu-primer-servicio-whoami)
  - [Tarea 3 · Publica una web estática](#tarea-3--publica-una-web-estática)
  - [Tarea 4 · Adminer y una base de datos](#tarea-4--adminer-y-una-base-de-datos)
  - [Tarea 5 · Publica por subdominio y combina las dos formas](#tarea-5--publica-por-subdominio-y-combina-las-dos-formas)
  - [⭐ Reto · Un servicio que conoce su prefijo](#-reto--un-servicio-que-conoce-su-prefijo)
- [🔄 Cómo aplicar los cambios](#-cómo-aplicar-los-cambios)
- [🩺 Problemas frecuentes](#-problemas-frecuentes)
- [📤 Entrega](#-entrega)

---

## 🎯 Qué vas a hacer

| Tarea | Qué haces | Qué aprendes |
|---|---|---|
| 1 | Arrancas el entorno y personalizas el portal | Cómo está montado: un solo puerto, volúmenes, logs |
| 2 | Publicas **whoami** en `/whoami/` (guiada) | `location`, `rewrite`, `proxy_pass` y cabeceras |
| 3 | Publicas una **web estática** en `/mi-web/` y arreglas un fallo | Rutas absolutas y relativas detrás de un prefijo |
| 4 | Publicas **Adminer** en `/adminer/` con una base de datos detrás | Qué servicios se publican y cuáles se quedan dentro |
| 5 | Publicas whoami en `whoami.localhost` y **Uptime Kuma** en `kuma.localhost` | Publicar por subdominio (`server_name`) y combinarlo con las rutas |
| ⭐ | (Opcional) Publicas **Dozzle** en `/dozzle/` | Servicios que necesitan conocer su ruta |

Necesitas **Docker Desktop** (o Docker Engine con `docker compose`) y **Git**.

---

## 🧠 Conceptos

### ¿Qué es un reverse proxy?

Es un servidor que se pone **delante** de tus servicios y hace de recepcionista: todas las visitas entran por la misma puerta (el puerto 80) y él decide, mirando la URL, a qué servicio pasar cada petición.

![Sin reverse proxy cada servicio publica su puerto; con reverse proxy solo se publica el 80](docs/img/sin-y-con-proxy.svg)

Ventajas:

- **Un solo puerto abierto.** Los servicios no se publican; solo se puede llegar a ellos a través del proxy.
- **URLs fáciles de recordar:** `http://localhost/portainer/` en vez de `http://localhost:9000`.
- **Un único punto de control** para añadir HTTPS, contraseñas, límites, logs…

### Arquitectura de la práctica

![Arquitectura: el proxy reparte /, /code/ y /portainer/; tú añades whoami, mi-web y adminer](docs/img/arquitectura.svg)

```text
nginx-reverse-proxy/
├── docker-compose.yml     ← los servicios (contenedores)
├── .env.template          ← plantilla de contraseñas (cópiala como .env)
├── proxy/
│   ├── nginx.conf         ← las reglas del reverse proxy
│   └── web/               ← el portal de inicio (http://localhost/)
│       ├── index.html
│       ├── apps.js        ← las cajas del portal: una por servicio
│       ├── estilo.css
│       └── img/           ← iconos (generica.svg sirve para cualquier servicio)
└── servicios/
    └── mi-web/            ← la web de la Tarea 3
```

### El `docker-compose.yml`

El proxy es un `nginx:alpine` **sin Dockerfile**: la configuración y la web se le pasan como **volúmenes**.

```yaml
services:
  proxy:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"                 # el ÚNICO puerto publicado de todo el proyecto
    volumes:
      - ./proxy/nginx.conf:/etc/nginx/conf.d/default.conf:ro   # la configuración
      - ./proxy/web:/usr/share/nginx/html:ro                   # la web del portal

  portainer:                    # sin "ports": solo se llega a través del proxy
    image: portainer/portainer-ce:latest
    ...
```

Fíjate en dos cosas:

1. **Solo el proxy tiene `ports`.** El resto de servicios están en la red interna de Docker y no se puede entrar en ellos directamente desde el navegador.
2. **El nombre del servicio es su nombre en la red.** Dentro de Docker, el proxy llega a Portainer con `portainer:9000` y a code-server con `code:8443`: Docker hace de DNS.

Un volumen hace que el contenedor use **tus archivos**, no una copia: si cambias algo de `proxy/web/`, basta con recargar el navegador.

![Los volúmenes conectan archivos de tu PC con rutas del contenedor](docs/img/volumenes.svg)

### El `nginx.conf`

Cada servicio publicado ocupa un bloque como este (el de Portainer):

```nginx
# --- PORTAINER: /portainer/ → servicio "portainer", puerto 9000 ---
location = /portainer { return 301 /portainer/; }
location /portainer/ {
    set $prefijo /portainer;
    set $destino portainer:9000;
    rewrite ^/portainer(/.*)$ $1 break;
    proxy_pass http://$destino;
}
```

| Línea | Qué hace |
|---|---|
| `location = /portainer { return 301 /portainer/; }` | Si alguien escribe `/portainer` sin la barra final, lo redirige a `/portainer/` |
| `location /portainer/ {` | Este bloque atiende **todas** las rutas que empiezan por `/portainer/` |
| `set $prefijo /portainer;` | Se envía al servicio en la cabecera `X-Forwarded-Prefix`, por si quiere saber bajo qué ruta está publicado |
| `set $destino portainer:9000;` | **Nombre del servicio** en el `docker-compose.yml` **:** **puerto interno** en el que escucha |
| `rewrite ^/portainer(/.*)$ $1 break;` | **Quita el prefijo:** `/portainer/api/status` pasa a ser `/api/status` |
| `proxy_pass http://$destino;` | Reenvía la petición al servicio y devuelve su respuesta al navegador |

Así viaja una petición:

![Recorrido de una petición: location, rewrite y proxy_pass](docs/img/recorrido-peticion.svg)

Pruébalo tú mismo: abre <http://localhost/portainer/api/status> y verás la respuesta JSON de Portainer, que ha recibido la petición como `/api/status`.

| Pides… | Encaja con… | Resultado |
|---|---|---|
| `/portainer` | `location = /portainer` | Redirección a `/portainer/` |
| `/portainer/api/status` | `location /portainer/` | Portainer recibe `GET /api/status` |
| `/code/` | `location /code/` | code-server recibe `GET /` |
| `/apps.js` | ninguno | nginx sirve el archivo `proxy/web/apps.js` |
| `/noexiste` | ninguno | `404 Not Found` |

Al principio del fichero hay tres cosas que no hace falta tocar, pero conviene entender:

- **Las cabeceras `proxy_set_header`** (`Host`, `X-Real-IP`, `X-Forwarded-For`…) le cuentan al servicio quién hizo la petición original. Sin ellas, el servicio solo vería que le llama el proxy. Las verás en directo en la Tarea 2. Están **fuera** de los bloques `server` para que las hereden todos, también los de subdominio de la Tarea 5.
- **El bloque `map … $connection_upgrade`** deja pasar los **WebSockets**, conexiones que se quedan abiertas. code-server no funciona sin ellos.
- **`resolver 127.0.0.11`** junto con `set $destino` hacen que nginx busque cada servicio **en cada petición**, en vez de una sola vez al arrancar. Por eso el proxy arranca aunque un servicio esté parado o mal escrito: solo falla esa ruta, con un `502`.

### Rutas o subdominios: dos formas de repartir

Hasta ahora el proxy decide **mirando la ruta** (lo que va después del nombre). Pero también puede decidir **mirando el nombre** que has escrito en el navegador. Piensa en un edificio de oficinas con un solo portal (el puerto 80) y un recepcionista (nginx):

- **Por ruta** es decirle «voy a la planta 3»: todos llegan a la misma dirección y el recepcionista te manda por el pasillo que toca.
- **Por subdominio** es que cada empresa del edificio tenga **su propio rótulo y su propia dirección**, aunque físicamente sea el mismo portal.

| | Por **ruta** | Por **subdominio** |
|---|---|---|
| URL | `http://localhost/code/` | `http://code.localhost/` |
| nginx mira… | el principio de la ruta → `location /code/` | el nombre pedido (cabecera `Host`) → `server_name code.localhost` |
| Bloque en `nginx.conf` | un `location` dentro del `server` principal | un `server { }` propio por servicio |
| ¿Hace falta `rewrite`? | Sí, para quitar el prefijo (o configurar el servicio, como en el ⭐ Reto) | No: el servicio está en `/`, como si fuera el único |
| Rutas absolutas (`/css/…`) | Se rompen (Tarea 3) | Funcionan |
| Servicios que no admiten subruta (Uptime Kuma…) | No funcionan | Funcionan |
| ¿Qué necesita el nombre? | Nada: solo hay un nombre | Que cada nombre **resuelva a la IP del proxy** (ver abajo) |
| Cuándo encaja | Pocos servicios, sin DNS, pruebas rápidas | Lo habitual en producción: cada servicio con su nombre |

**Cómo decide nginx cuando hay de las dos.** Una petición pasa por dos filtros, siempre en este orden:

1. **¿Qué `server`?** nginx compara el nombre de la petición (`Host`) con los `server_name`. Si ninguno encaja, la atiende el que lleva `default_server`: en esta práctica, el servidor principal con el portal y las rutas.
2. **¿Qué `location`?** Dentro del `server` elegido, compara la ruta con sus `location`.

```text
http://kuma.localhost/dashboard   → server kuma.localhost  → location /          → kuma:3001  recibe /dashboard
http://localhost/code/            → server principal       → location /code/     → code:8443  recibe /
http://localhost/kuma/            → server principal       → ningún location     → 404 del portal
```

**Combinarlas** es tan sencillo como tener los dos tipos de bloque en el mismo `nginx.conf`: el `server` principal (portal + rutas) y un `server` por cada subdominio. Un mismo servicio puede incluso publicarse de las dos formas a la vez (un `location` en el principal y su propio `server`): cada bloque es solo una puerta más hacia el mismo contenedor. Un reparto razonable:

- **Por ruta:** el portal y los servicios que funcionan bien detrás de un prefijo (code-server, Portainer, Adminer…).
- **Por subdominio:** los que no admiten subruta o tienen rutas absolutas (Uptime Kuma, muchas webs), y los que queremos que tengan una dirección «limpia» (`www`, `intranet`…).

**¿Cómo llega el nombre al proxy?** Para que `code.localhost` o `intranet.innovatechsolutions.com` lleguen a tu nginx, el nombre tiene que **resolver a la IP del proxy**:

| Dónde estás | Qué haces |
|---|---|
| En tu PC, con `*.localhost` | Nada: Chrome, Edge y Firefox resuelven cualquier `algo.localhost` a `127.0.0.1` solos |
| Otro nombre en tu PC (o un navegador que no lo resuelva) | Una línea en el fichero `hosts` por nombre: `127.0.0.1 kuma.localhost` (Linux/macOS: `/etc/hosts`; Windows: `C:\Windows\System32\drivers\etc\hosts`) |
| En una red con DNS (como el reto de la PYME) | Un registro `A` por subdominio en el DNS, apuntando a la IP del servidor del proxy |

> Si publicas el proxy en otro puerto (`"8080:80"`), el puerto va detrás del nombre: `http://kuma.localhost:8080/`. nginx compara el nombre sin el puerto, así que el `server_name` no cambia.

---

## 🛠️ Tareas

### Tarea 1 · Arranca el entorno y explóralo

**1. Clona tu repositorio y crea el `.env`** con la contraseña de code-server:

```bash
git clone <url-de-tu-repositorio>
cd nginx-reverse-proxy
cp .env.template .env        # después edita .env y cambia la contraseña
```

**2. Arranca todo** y comprueba el estado:

```bash
docker compose up -d
docker compose ps
```

```text
SERVICE     STATUS         PORTS
code        Up 5 seconds   8443/tcp
portainer   Up 5 seconds   8000/tcp, 9000/tcp, 9443/tcp
proxy       Up 5 seconds   0.0.0.0:80->80/tcp
```

Solo `proxy` tiene un puerto publicado (`0.0.0.0:80->80`). Los demás muestran sus puertos internos, que no son accesibles desde fuera.

**3. Abre <http://localhost/>.** Es el portal, servido por el propio proxy desde `proxy/web/`:

![Portal de inicio con Code Server y Portainer](docs/img/portal-inicial.png)

**4. Entra en Code Server** (`/code/`) con la contraseña del `.env`. Es VS Code en el navegador, abierto sobre la carpeta del proyecto: puedes editar los ficheros de la práctica desde aquí. Si te pregunta si confías en la carpeta, pulsa **Trust**.

![code-server con nginx.conf abierto, a través de /code/](docs/img/code-server.png)

**5. Entra en Portainer** (`/portainer/`) y crea el usuario administrador:

- La contraseña debe tener **al menos 12 caracteres**.
- Te pide un **setup token**, que Portainer escribe en sus logs al arrancar:

  ```bash
  docker compose logs portainer | grep setup_token              # Git Bash, Linux, macOS
  docker compose logs portainer | Select-String setup_token     # PowerShell
  ```

  ```text
  portainer-1  | setup_token=64752a9c...
  ```

![Pantalla de alta de Portainer con el campo Setup token](docs/img/portainer-setup.png)

> ⏱️ Tienes **5 minutos** desde que arranca Portainer para crear el usuario. Si se pasa el tiempo, al entrar en `/portainer/` acabarás en un `404` en `/timeout.html`. Ejecuta `docker compose restart portainer` y vuelve a intentarlo (el token cambia en cada arranque).

**6. Personaliza el portal.** Edita `proxy/web/apps.js` y cambia el título y el pie (pon tu nombre):

```js
const PORTAL = {
  titulo: 'Servidor de Ane',
  subtitulo: 'Reverse proxy con nginx y Docker',
  pie: 'Práctica de reverse proxy · Ane Etxeberria',
};
```

Guarda y recarga el navegador (F5). No hace falta reiniciar nada: `proxy/web/` es un volumen.

✅ **Comprueba:** el portal muestra tu nombre, entras en code-server y en Portainer, y <http://localhost:9000> **no** responde. Portainer solo es accesible a través del proxy.

---

### Tarea 2 · Tu primer servicio: whoami

[whoami](https://github.com/traefik/whoami) es un servidor web diminuto que responde con **la petición que le ha llegado**. Es perfecto para ver qué hace el proxy con cada petición.

**1. Añade el servicio** al final de `services:` en `docker-compose.yml`, sin `ports`:

```yaml
  whoami:                       # → /whoami/
    image: traefik/whoami
    restart: unless-stopped
```

```bash
docker compose up -d
```

**2. Añade su bloque** en `proxy/nginx.conf`, dentro de `server { … }`, después del de Portainer. whoami escucha en el puerto **80**:

```nginx
    # --- WHOAMI: /whoami/ → servicio "whoami", puerto 80 ---
    location = /whoami { return 301 /whoami/; }
    location /whoami/ {
        set $prefijo /whoami;
        set $destino whoami:80;
        rewrite ^/whoami(/.*)$ $1 break;
        proxy_pass http://$destino;
    }
```

**3. Reinicia el proxy** para que lea la nueva configuración, y mira sus logs por si hay errores:

```bash
docker compose restart proxy
docker compose logs proxy
```

**4. Prueba** <http://localhost/whoami/hola>:

```text
Hostname: 5d30021cbe95
IP: 127.0.0.1
IP: 172.22.0.5
RemoteAddr: 172.22.0.4:49914          ← quién le habla: el PROXY
GET /hola HTTP/1.1                    ← la ruta que le llega: SIN /whoami
Host: localhost
User-Agent: Mozilla/5.0 (...)
X-Forwarded-For: 172.22.0.1           ← quién hizo la petición original: TU navegador
X-Forwarded-Prefix: /whoami           ← bajo qué ruta está publicado
X-Forwarded-Proto: http
X-Real-Ip: 172.22.0.1
```

**5. Añádelo al portal** en `proxy/web/apps.js`, dentro de `APPS`:

```js
  {
    nombre: 'Whoami',
    ruta: '/whoami/',                  // la misma ruta que su location
    imagen: 'img/generica.svg',        // o descarga un icono en img/
    descripcion: 'Muestra la petición que le llega',
  },
```

🧪 **Experimento 1: sin `rewrite`.** Comenta la línea del `rewrite` poniendo `#` delante, reinicia el proxy y vuelve a abrir `/whoami/hola`. Ahora whoami recibe `GET /whoami/hola`: el prefijo llega entero. Vuelve a dejar la línea como estaba.

🧪 **Experimento 2: servicio caído.** Para whoami y entra en `/whoami/`:

```bash
docker compose stop whoami
docker compose logs proxy --tail 3
```

Verás `502 Bad Gateway` en el navegador y `whoami could not be resolved` en el log. El portal y el resto de rutas siguen funcionando. Arráncalo de nuevo con `docker compose start whoami`.

---

### Tarea 3 · Publica una web estática

En `servicios/mi-web/` tienes una web sencilla. La va a servir **su propio contenedor nginx**, y el proxy la publicará en `/mi-web/`.

**1. Añade el servicio.** Es la misma idea que el proxy: un `nginx:alpine` con la web montada como volumen.

```yaml
  mi-web:                       # → /mi-web/
    image: nginx:alpine
    restart: unless-stopped
    volumes:
      - ./servicios/mi-web:/usr/share/nginx/html:ro
```

**2. Escribe tú el bloque** en `nginx.conf`, siguiendo el de whoami. Datos: ruta `/mi-web/`, servicio `mi-web`, puerto `80`. Reinicia el proxy.

**3. Abre <http://localhost/mi-web/>.** Algo falla: la página sale **sin estilos**.

<p align="center">
  <img src="docs/img/mi-web-rota.png" width="49%" alt="La web sin estilos">
  <img src="docs/img/mi-web-ok.png" width="49%" alt="La web con estilos">
</p>

**4. Investiga.** Pulsa **F12 → Red (Network)** y recarga. Verás que `web.css` da **404** y que el navegador lo ha pedido a `http://localhost/css/web.css`, fuera de `/mi-web/`. Mira el `<link>` de `servicios/mi-web/index.html`:

```html
<link rel="stylesheet" href="/css/web.css">
```

La ruta empieza por `/`, así que es **absoluta**: el navegador la busca en la raíz del servidor, que es el portal, no tu web.

![Rutas absolutas y relativas detrás de un prefijo](docs/img/rutas-relativas.svg)

**5. Arréglalo** quitando la `/` inicial (`href="css/web.css"`) y recarga con F5. Como la web es un volumen, el cambio se ve al momento. Pon también tu nombre en el `<h1>`.

> El enlace **Volver al portal** (`href="/"`) sí es absoluto a propósito: queremos salir de `/mi-web/` e ir a la raíz.

**6. Añádela al portal** en `apps.js`.

---

### Tarea 4 · Adminer y una base de datos

[Adminer](https://www.adminer.org/) es un gestor de bases de datos web. Vas a publicarlo en `/adminer/` con una base de datos MariaDB detrás. **La base de datos no se publica:** solo Adminer habla con ella, dentro de la red de Docker.

**1. Añade la contraseña de la base de datos** al `.env` (y también a `.env.template`, para que quien clone tu repositorio sepa que hace falta):

```bash
# Contraseña del usuario root de MariaDB
DB_PASSWORD=cambiame
```

**2. Añade los dos servicios:**

```yaml
  db:                           # base de datos: NO pasa por el proxy
    image: mariadb:11
    restart: unless-stopped
    environment:
      MARIADB_ROOT_PASSWORD: "${DB_PASSWORD:?Falta DB_PASSWORD en .env}"
      MARIADB_DATABASE: clase
    volumes:
      - db_datos:/var/lib/mysql

  adminer:                      # → /adminer/
    image: adminer
    restart: unless-stopped
    environment:
      ADMINER_DEFAULT_SERVER: db
```

Y declara el volumen al final del fichero, en la sección `volumes:`:

```yaml
volumes:
  code_config:
  portainer_data:
  db_datos:
```

**3. Escribe el bloque** de `/adminer/` en `nginx.conf`. Adminer escucha en el puerto **8080**. Arranca con `docker compose up -d` y reinicia el proxy.

**4. Entra en <http://localhost/adminer/>** con servidor `db`, usuario `root`, la contraseña del `.env` y base de datos `clase`. Fíjate en que el servidor es `db`: otra vez, el nombre del servicio.

![Login de Adminer con el servidor db](docs/img/adminer-login.png)

**5. Añádelo al portal.**

---

### Tarea 5 · Publica por subdominio y combina las dos formas

Hasta ahora todo cuelga de `localhost/…`. En esta tarea vas a dar a algunos servicios **su propio nombre**, sin tocar las rutas que ya funcionan. Antes de empezar, repasa [Rutas o subdominios](#rutas-o-subdominios-dos-formas-de-repartir).

**1. whoami también por subdominio.** No hace falta un contenedor nuevo: es el mismo whoami de la Tarea 2. Al final de `proxy/nginx.conf`, **fuera** del `server` principal, añade un bloque `server` propio (tienes la plantilla comentada al final del fichero):

```nginx
# --- WHOAMI por subdominio: whoami.localhost → servicio "whoami", puerto 80 ---
server {
    listen 80;
    server_name whoami.localhost;
    set $prefijo "";

    location / {
        set $destino whoami:80;
        proxy_pass http://$destino;
    }
}
```

Fíjate en lo que **no** está: ni `rewrite`, ni redirección de la barra final. No hay prefijo que quitar.

Reinicia el proxy y abre <http://whoami.localhost/hola>. Compáralo con <http://localhost/whoami/hola>, que sigue funcionando:

| | `localhost/whoami/hola` | `whoami.localhost/hola` |
|---|---|---|
| `Host:` | `localhost` | `whoami.localhost` |
| Ruta que recibe | `GET /hola` (gracias al `rewrite`) | `GET /hola` (sin hacer nada) |
| `X-Forwarded-Prefix:` | `/whoami` | vacío |

El mismo contenedor, publicado de **las dos formas a la vez**.

> ¿No abre `whoami.localhost`? Tu navegador no resuelve `*.localhost`: añade `127.0.0.1 whoami.localhost` a tu fichero `hosts` (ver [cómo llega el nombre al proxy](#rutas-o-subdominios-dos-formas-de-repartir)).

**2. Uptime Kuma: un servicio que necesita subdominio.** [Uptime Kuma](https://github.com/louislam/uptime-kuma) vigila si tus servicios están en marcha. No funciona en una subruta, así que es el candidato perfecto para un subdominio.

```yaml
  kuma:                         # → http://kuma.localhost/
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    volumes:
      - kuma_datos:/app/data
```

Declara `kuma_datos:` en la sección `volumes:` y escribe **tú** su bloque `server` con `server_name kuma.localhost`. Kuma escucha en el puerto **3001** y usa WebSockets (ya están cubiertos por las cabeceras comunes). Arranca con `docker compose up -d` y reinicia el proxy.

Abre <http://kuma.localhost/>, crea el usuario y añade un monitor HTTP para cada servicio. Usa sus nombres internos: `http://whoami`, `http://mi-web`, `http://portainer:9000`… Kuma está dentro de la red de Docker y los encuentra igual que el proxy.

**3. Añade las cajas al portal.** Para un subdominio, `ruta` es la URL completa:

```js
  {
    nombre: 'Uptime Kuma',
    ruta: 'http://kuma.localhost/',
    imagen: 'img/generica.svg',
    descripcion: 'Estado de los servicios',
  },
```

🧪 **Experimento 1: un nombre que no existe.** Abre <http://loquesea.localhost/>. Aparece **el portal**. Ningún `server_name` encaja, así que la petición la atiende el `default_server`, que es el servidor principal. Ahora prueba <http://kuma.localhost/code/>. **No** abre code-server: el filtro del `server` va primero, y en el de Kuma no hay ningún `location /code/`.

🧪 **Experimento 2: rutas absolutas sin miedo.** Publica también `mi-web` por subdominio en `web.localhost`. Después vuelve a poner en su `index.html` la ruta absoluta que rompía la Tarea 3 (`href="/css/web.css"`). En <http://web.localhost/> se ve **con estilos**; en <http://localhost/mi-web/> vuelve a romperse. Deja la versión relativa, que funciona en los dos sitios. Fíjate también en **Volver al portal** (`href="/"`): en `web.localhost`, `/` es la raíz de la propia web, no el portal. Por eso, desde un subdominio, los enlaces a otro servicio llevan la URL completa (`http://localhost/`).

> **Cuando no estás en tu PC.** En un servidor real (por ejemplo, el del reto de la PYME), cambia `.localhost` por tu dominio: `server_name intranet.innovatechsolutions.com;`. Después crea en el DNS un registro `A` por subdominio que apunte a la IP del servidor donde corre el proxy. nginx no cambia nada más.

---

### ⭐ Reto · Un servicio que conoce su prefijo

Hasta ahora el proxy **quitaba el prefijo** con `rewrite` y el servicio creía estar en `/`. Algunos servicios funcionan mejor (o solo funcionan) si **saben** en qué ruta están publicados. En ese caso se les configura su ruta base y el proxy pasa la petición **sin rewrite**.

![Dos formas de publicar un servicio en una subruta](docs/img/estrategias-prefijo.svg)

Publica [Dozzle](https://dozzle.dev/), un visor de logs de contenedores, en `/dozzle/`. Pistas:

- Imagen `amir20/dozzle:latest`, puerto **8080**.
- Necesita leer el socket de Docker: `/var/run/docker.sock:/var/run/docker.sock:ro`.
- Su ruta base se configura con la variable de entorno `DOZZLE_BASE=/dozzle`.
- Su bloque en `nginx.conf` **no** lleva `rewrite`.
- La primera vez muestra un asistente de configuración: pulsa **Continuar sin inicio de sesión**.

Si prefieres otro servicio, busca en su documentación *base path*, *subpath* o *reverse proxy*. Ten en cuenta que algunas aplicaciones no funcionan en una subruta (por ejemplo, Uptime Kuma): para esas, usa un subdominio como en la [Tarea 5](#tarea-5--publica-por-subdominio-y-combina-las-dos-formas).

---

## 🔄 Cómo aplicar los cambios

| Has cambiado… | Haz… |
|---|---|
| Algo en `proxy/web/` o en `servicios/mi-web/` | Recarga el navegador (F5) |
| `proxy/nginx.conf` | `docker compose restart proxy` |
| `docker-compose.yml` o `.env` | `docker compose up -d` |

> También puedes reiniciar el proxy desde Portainer: **Containers → proxy → Restart**.

---

## 🩺 Problemas frecuentes

Lo primero, siempre: `docker compose ps` y `docker compose logs proxy`.

| Síntoma | Causa probable | Solución |
|---|---|---|
| **`502 Bad Gateway`** y en el log `could not be resolved` | El servicio está parado o el nombre en `$destino` no coincide con el del `docker-compose.yml` | `docker compose ps`; revisa el nombre |
| **`502 Bad Gateway`** y en el log `connect() failed (111: Connection refused)` | El puerto de `$destino` no es el puerto en el que escucha el servicio | Mira en la documentación de la imagen su puerto interno |
| **`404 Not Found`** de nginx | La ruta no encaja con ningún `location`, así que nginx la busca como archivo del portal | Revisa la ruta del `location` y la barra final |
| La página sale **sin estilos o sin imágenes** | Rutas absolutas (`/css/…`) detrás de un prefijo | Usa rutas relativas ([Tarea 3](#tarea-3--publica-una-web-estática)) |
| No carga **nada** (ni el portal) y el proxy aparece como `Restarting` | Error de sintaxis en `nginx.conf` | `docker compose logs proxy` muestra la línea: `[emerg] unexpected "}" in /etc/nginx/conf.d/default.conf:57` |
| `/portainer/` da `404` en `/timeout.html` | Pasaron 5 minutos sin crear el usuario admin | `docker compose restart portainer` y créalo enseguida |
| `Falta CODE_PASSWORD` al usar `docker compose` | No existe el fichero `.env` | `cp .env.template .env` |
| `bind: address already in use` al arrancar | Otro programa usa el puerto 80 | Cambia `"80:80"` por `"8080:80"` y entra en `http://localhost:8080/` |
| He cambiado `nginx.conf` y no pasa nada | El proxy no se ha reiniciado | `docker compose restart proxy` |
| `algo.localhost` **no abre** (el navegador dice que no encuentra el sitio) | El nombre no resuelve a `127.0.0.1` | Añade `127.0.0.1 algo.localhost` al fichero `hosts` o prueba con Chrome/Firefox |
| `algo.localhost` muestra **el portal** en vez del servicio | Ningún `server_name` coincide (errata, o falta el bloque) y responde el `default_server` | Revisa el `server_name` y reinicia el proxy |
| Un servicio por subdominio falla con WebSockets o pierde la IP del cliente | Has puesto un `proxy_set_header` dentro de su `server` y ya no hereda las comunes | Quítalo, o copia dentro también las demás cabeceras |

---

## 📤 Entrega

Así debería quedar tu portal (aquí con el reto incluido):

![Portal final con todos los servicios](docs/img/portal-final.png)

**Lista de comprobación:**

- [ ] El portal muestra tu nombre.
- [ ] `/whoami/`, `/mi-web/` y `/adminer/` funcionan y tienen su caja en el portal.
- [ ] `/mi-web/` se ve con estilos y con tu nombre.
- [ ] Adminer conecta con la base de datos `db`.
- [ ] `whoami` funciona en `localhost/whoami/` **y** en `whoami.localhost`, y Uptime Kuma en `kuma.localhost` con su caja en el portal.
- [ ] `.env.template` incluye `DB_PASSWORD` y el `.env` **no** está en el repositorio.
- [ ] Has creado `RESPUESTAS.md` con las respuestas a estas preguntas (2-3 líneas cada una):
  1. ¿Por qué solo el servicio `proxy` tiene `ports`? ¿Qué se gana con ello?
  2. ¿Qué ruta recibe whoami con `rewrite` y sin él? ¿Para qué sirve el `rewrite`?
  3. ¿Por qué tu web salía sin estilos y cómo lo arreglaste?
  4. ¿Por qué la base de datos no tiene un `location` en el proxy?
  5. ¿Qué pasa al entrar en la ruta de un servicio parado? ¿Y en las demás rutas? ¿Por qué?
  6. ¿Qué diferencia hay entre publicar por ruta y por subdominio? ¿Por qué Uptime Kuma necesita subdominio y code-server no?
  7. ¿Por qué `loquesea.localhost` muestra el portal y `kuma.localhost/code/` no abre code-server?

Sube tus cambios:

```bash
git add .
git commit -m "Práctica reverse proxy"
git push
```

Comprueba en GitHub que están todos los ficheros y que **no** aparece `.env`.

¡Suerte! 🚀
