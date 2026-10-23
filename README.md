# TerraValle — Backend

API del proyecto TerraValle, plataforma web progresiva (PWA) de bienes raíces que permite publicar inmuebles mediante **fichas técnicas estandarizadas** y obtener una **estimación orientativa de precio asistida por IA**.

> Proyecto académico de la materia **Programación de Aplicaciones Web Progresivas** — Universidad Tecnológica de Tula-Tepeji (UTTT).

---

## Descripción

Este repositorio contiene la lógica del servidor, la gestión de datos y los servicios que consume el frontend del proyecto, que se encuentra en un repositorio independiente: [terravalle-frontend](https://github.com/DevJIE-Network/terravalle-frontend).

## Responsabilidades principales

- Autenticación y gestión de usuarios.
- Registro y administración de inmuebles con su ficha técnica.
- Servicio de estimación orientativa de precio con IA.
- Búsqueda y filtrado del catálogo de inmuebles.
- Gestión de imágenes y archivos de los inmuebles.

## Estado del proyecto

🚧 **En desarrollo.** El servidor usa PostgreSQL (Azure Database for PostgreSQL) e incluye registro, inicio de sesión con JWT y consulta/edición del perfil propio. Las demás funcionalidades todavía no están implementadas.

## Estructura

```text
terravalle-backend/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── property.controller.js
│   │   └── user.controller.js
│   ├── middleware/
│   │   └── auth.middleware.js
│   ├── repositories/
│   │   ├── property.repository.js   # consultas SQL de properties y property_features
│   │   └── user.repository.js       # consultas SQL de la tabla users
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── property.routes.js
│   │   └── user.routes.js
│   ├── schemas/
│   │   ├── auth.schema.js
│   │   ├── property-characteristics.schema.js   # validación de HU-005
│   │   ├── property-management.schema.js        # validación de HU-008
│   │   └── user.schema.js
│   ├── utils/
│   │   └── jwt.js
│   └── server.js
├── tests/
│   ├── auth.test.js
│   ├── property-characteristics.test.js
│   ├── property-management.test.js
│   └── user.test.js
├── .env
├── .env.example
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

## Tecnologías

Node.js (CommonJS), Express 5, PostgreSQL con `pg` (node-postgres), Zod para validación, bcryptjs para hash de contraseñas, jsonwebtoken para sesiones, CORS y dotenv. Nodemon se utiliza durante el desarrollo.

## Instalación y ejecución

Requisitos: **Node.js 20.19 o superior**, npm y una base de datos PostgreSQL (local o Azure) con el esquema de TerraValle cargado.

```bash
npm install
```

Copia `.env.example` a `.env` si este último no existe y ajusta sus valores:

| Variable | Uso | Valor de ejemplo |
| --- | --- | --- |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto HTTP | `3000` |
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://usuario:contraseña@servidor:5432/terravalle?sslmode=verify-full` |
| `JWT_SECRET` | Firma de los tokens (mínimo 32 caracteres) | `cambia-esto-por-un-secreto-largo` |
| `JWT_EXPIRES_IN` | Duración del token | `1h` |
| `CORS_ORIGIN` | Origen permitido del frontend | `http://localhost:5173` |

`.env` es configuración local y no se versiona. No añadas credenciales reales a `.env.example`.

```bash
npm run dev
```

Para ejecutar sin recarga automática, utiliza `npm start`. El servidor se inicia únicamente después de conectarse a PostgreSQL.

## Endpoints disponibles

### `GET /api/health`

Comprueba que el servidor HTTP responde: `{"status":"ok"}`. No es una comprobación de disponibilidad de la base de datos.

### `POST /api/auth/register`

Envía un cuerpo JSON con los siguientes campos:

```json
{
  "name": "Usuario TerraValle",
  "email": "usuario@example.com",
  "password": "una-clave-segura"
}
```

- `name`: entre 2 y 100 caracteres, sin espacios al inicio o final.
- `email`: correo válido; se normaliza a minúsculas y debe ser único.
- `password`: al menos 8 caracteres y como máximo 72 bytes en UTF-8 (límite de bcrypt). Se almacena únicamente su hash y nunca se devuelve en las respuestas.
- No se aceptan campos adicionales.

Respuestas: `201` al crear el usuario, `400` si los datos o el JSON son inválidos, `409` si el correo ya existe y `413` si el cuerpo supera 10 KB. El registro no crea una sesión ni emite un token de acceso.

### Perfil del usuario (HU-003)

Todas las rutas requieren el encabezado `Authorization: Bearer <token>` obtenido en el inicio de sesión.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/users/me` | Devuelve `id`, `name` y `email` del usuario autenticado. |
| `PATCH` | `/api/users/me` | Actualiza `name` y/o `email` del usuario autenticado. |
| `GET` / `PATCH` | `/api/users/:id` | Igual que `/me` si `:id` es la cuenta propia; `403` si es otra cuenta. |

Cuerpo de ejemplo para `PATCH`:

```json
{
  "name": "Nuevo nombre",
  "email": "nuevo@example.com"
}
```

- Solo se aceptan `name` y `email`; cualquier otro campo se rechaza con `400`.
- `email` se normaliza a minúsculas y debe seguir siendo único (`409` si ya lo usa otra cuenta).
- Respuestas: `200` con el perfil vigente, `400` por datos inválidos, `401` sin sesión válida, `403` al intentar acceder a otra cuenta y `409` por correo duplicado.

### Dimensiones y características del inmueble (HU-005)

Complementan una propiedad ya registrada (HU-004) con las medidas del terreno y, si existe, los datos de la construcción. Requieren `Authorization: Bearer <token>` y solo el dueño de la propiedad puede usarlas.

Los datos se guardan en la tabla `property_features` del esquema de TerraValle (una fila por propiedad, con `UNIQUE (property_id)`); no requiere migraciones adicionales.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `PUT` | `/api/properties/:id/characteristics` | Crea o reemplaza las dimensiones y características de la propiedad. |
| `GET` | `/api/properties/:id/characteristics` | Devuelve `{ "characteristics": {...} }`, o `null` si aún no se capturan. |

Cuerpo de ejemplo para una propiedad **con** construcción:

```json
{
  "landArea": 200,
  "frontage": 10,
  "depth": 20,
  "hasConstruction": true,
  "builtArea": 150,
  "bedrooms": 3,
  "bathrooms": 2,
  "floors": 2,
  "parkingSpaces": 1,
  "constructionAge": 5,
  "generalCondition": "bueno"
}
```

Para un terreno **sin** construcción basta con `{ "landArea": 200, "frontage": 10, "depth": 20, "hasConstruction": false }`.

| Campo | Regla |
| --- | --- |
| `landArea` | Obligatorio. Superficie del terreno en m², mayor que 0, máximo 2 decimales. |
| `frontage`, `depth` | Opcionales. Frente y fondo en metros, mayores que 0. Si se envían ambos, `landArea` no puede superar `frontage × depth` (10 % de holgura). |
| `hasConstruction` | Obligatorio. `true` o `false`. |
| `builtArea` | Obligatorio con construcción: m² mayores que 0 y no mayores que `landArea × floors`. |
| `bedrooms` | Obligatorio con construcción: entero ≥ 0. |
| `bathrooms` | Obligatorio con construcción: ≥ 0, entero o medio baño (1, 1.5, 2...). |
| `floors` | Obligatorio con construcción: entero ≥ 1. |
| `constructionAge` | Obligatorio con construcción: años, entero ≥ 0 (0 = nueva). |
| `generalCondition` | Obligatorio con construcción: `excelente`, `bueno`, `regular` o `malo`. |
| `parkingSpaces` | Opcional con construcción: entero ≥ 0 (si se omite se guarda 0). |

- Con `hasConstruction: false` no se exige ningún campo de edificación y, si se envía alguno con valor, se rechaza con `400`. Los valores vacíos o `null` se tratan como ausentes.
- Los datos son declarados por el vendedor: son informativos y no sustituyen documentación oficial.
- Respuestas: `200` guardado o consultado, `400` datos inválidos (con el detalle por campo en `errors`), `401` sin sesión válida, `403` si la propiedad es de otro vendedor y `404` si no existe.

### Servicios disponibles en la propiedad (HU-006)

Permiten indicar los servicios e infraestructura del inmueble o de su acceso inmediato. Los servicios salen de un catálogo controlado por TerraValle (tabla `services`) y se asocian a la propiedad en `property_services`, cuya llave primaria `(property_id, service_id)` impide duplicados. No requiere migraciones adicionales: el catálogo inicial ya viene en el script SQL.

| Método | Ruta | Sesión | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/services` | No | Catálogo de servicios activos. |
| `GET` | `/api/properties/:id/services` | Sí, dueño | Servicios registrados en la propiedad. |
| `PUT` | `/api/properties/:id/services` | Sí, dueño | Reemplaza la selección completa de servicios. |

Catálogo inicial: `1` Agua potable, `2` Electricidad, `3` Drenaje, `4` Gas, `5` Internet, `6` Alumbrado público, `7` Pavimentación y `8` Banqueta.

Cuerpo de ejemplo para `PUT`:

```json
{ "serviceIds": [1, 2, 3, 6] }
```

- `serviceIds` es la **selección completa**: los servicios que no vengan se desmarcan y `[]` quita todos.
- Los id repetidos se guardan una sola vez. Un id que no existe o está inactivo se rechaza con `400` e `invalidServiceIds`.
- Los datos son declarativos: no representan certificación de disponibilidad por parte de los proveedores.
- Respuestas: `200` con `{ "services": [...] }` vigentes, `400` datos inválidos, `401` sin sesión válida, `403` si la propiedad es de otro vendedor y `404` si no existe.

### Administrar mis propiedades (HU-008)

Panel del vendedor: consultar, editar, activar/desactivar y retirar **solo sus propias propiedades**. Todas las rutas requieren `Authorization: Bearer <token>` y verifican que el usuario sea el propietario (`403` si la propiedad es de otro vendedor y `404` si no existe). No requieren cambios en la base de datos: usan `properties` y `property_status_history`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/properties/mine` | Lista únicamente las propiedades del usuario autenticado (incluye las retiradas). Filtros opcionales: `status`, `page` (por omisión 1) y `limit` (por omisión 20, máximo 100). |
| `GET` | `/api/properties/mine/:id` | Detalle de una propiedad propia. |
| `PATCH` | `/api/properties/:id` | Edición parcial de `title`, `propertyTypeId`, `description` y `publicationPrice`. |
| `PATCH` | `/api/properties/:id/status` | Activa o desactiva la propiedad: `{ "status": "active" \| "inactive", "reason": "opcional" }`. |
| `DELETE` | `/api/properties/:id` | Retira la propiedad (retiro lógico, sin borrar información). |

- **Estados de publicación:** `draft` (al registrarla), `active`, `inactive` y `withdrawn`. Solo las `active` deben mostrarse a los compradores: cualquier catálogo público o búsqueda debe filtrar por `status = 'active'`.
- **Cambios permitidos:** `draft → active`, `active → inactive` e `inactive → active`. Cualquier otro cambio, o repetir el estado actual, responde `409`. El retiro es definitivo: una propiedad `withdrawn` no se puede editar, reactivar ni volver a retirar.
- **Retiro lógico:** se guarda `status = 'withdrawn'` y `withdrawn_at`; la fila, fotos, características y servicios se conservan para trazabilidad.
- **Historial:** cada cambio de estado se registra en `property_status_history` (estado anterior, nuevo, quién lo hizo y motivo).
- **Edición:** solo se actualizan los campos enviados; deben enviarse al menos uno. El propietario (`owner_id`) y el estado no se pueden cambiar por `PATCH /:id`. `description` y `publicationPrice` aceptan `null` o texto vacío para quitarlos. El título lleva 3 a 150 caracteres, la descripción máximo 3000 y el precio es ≥ 0 con máximo 2 decimales. `propertyTypeId` debe ser un tipo existente y activo.
- Respuestas: `200` correcto, `400` datos o filtros inválidos (detalle por campo en `errors`), `401` sin sesión, `403` propiedad ajena, `404` inexistente y `409` cambio de estado no permitido o propiedad modificada mientras tanto.

## Calidad de código (SonarQube Cloud)

El análisis estático se ejecuta automáticamente con **SonarQube Cloud** (plan gratuito para repositorios públicos) mediante GitHub Actions.

- **Workflow:** `.github/workflows/sonarcloud.yml`. Corre en cada push a `main`, `developer`, `release` y ramas `sprint*`, y en cada Pull Request. También se puede lanzar a mano desde **Actions → Calidad de código → Run workflow**.
- **Pasos:** instala dependencias, ejecuta las pruebas con cobertura (`npm run test:coverage`, que genera `lcov.info`) y envía el código y la cobertura a SonarQube Cloud.
- **Configuración:** `sonar-project.properties` (organización, clave del proyecto, carpetas `src` y `tests`, y ruta de la cobertura).
- **Métricas:** bugs, vulnerabilidades, security hotspots, code smells, duplicación, cobertura y deuda técnica, además de la *Quality Gate* del código nuevo.

### Configuración inicial (una sola vez)

1. Entrar a [sonarcloud.io](https://sonarcloud.io) con la cuenta de GitHub e importar la organización `DevJIE-Network`.
2. Crear el proyecto `terravalle-backend` (plan Free) y en **Administration → Analysis Method** desactivar *Automatic Analysis*.
3. Generar un token en **My Account → Access tokens**.
4. En GitHub: **Settings → Secrets and variables → Actions** → secreto `SONAR_TOKEN` con ese token. El token nunca se guarda en el código.

### Ejecutar localmente las pruebas con cobertura

```bash
npm run test:coverage
```

Muestra la tabla de cobertura y genera `lcov.info` (ignorado por Git).

## Migraciones de base de datos (node-pg-migrate)

Los cambios estructurales de PostgreSQL se versionan con **[node-pg-migrate](https://github.com/salsita/node-pg-migrate)**. Cada migración tiene `up` (aplicar) y `down` (revertir), y el historial de las aplicadas se guarda en la tabla `pgmigrations`.

| Archivo | Tipo de cambio |
| --- | --- |
| `migrations/1792700000001_esquema-inicial.js` | Baseline: esquema original (16 tablas, índices, trigger y catálogos). El SQL está en `db/baseline/`. |
| `migrations/1792700000002_crear-tabla-solicitudes-contacto.js` | Creación de tabla `property_contact_requests` (con llave foránea, CHECK de estado e índice). |
| `migrations/1792700000003_agregar-icono-a-servicios.js` | Adición de columna `services.icon` y carga de valores. |
| `migrations/1792700000004_restriccion-formato-telefono.js` | Restricción `chk_users_phone_format` sobre `users.phone`. |

### Configuración

Las migraciones usan su propia variable para no tocar producción por accidente. En `.env`:

```env
MIGRATION_DATABASE_URL=postgresql://usuario:contraseña@servidor:5432/terravalle_dev?sslmode=verify-full
```

Debe apuntar a una base de **desarrollo o pruebas** (por ejemplo `terravalle_dev`). Las pruebas de reversión no se hacen en producción.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run migrate:status` | Lista cada migración como **APLICADA** (con fecha) o **PENDIENTE**. |
| `npm run migrate:up` | Aplica todas las migraciones pendientes, en orden y en una sola transacción. |
| `npm run migrate:down` | Revierte la última migración aplicada (`npm run migrate:down -- 2` revierte las dos últimas). |
| `npm run migrate:redo` | Revierte y vuelve a aplicar la última migración. |
| `npm run migrate:create -- nombre-del-cambio` | Crea un archivo de migración nuevo con fecha en el nombre. |
| `npm run migrate:baseline` | Marca la baseline como aplicada **sin ejecutarla** (solo para bases que ya tienen el esquema, como producción). |

### Desde una base limpia

```bash
npm run migrate:status   # 4 pendientes
npm run migrate:up       # crea todo el esquema y aplica los cambios
npm run migrate:status   # 4 aplicadas
```

### Reversión controlada y reaplicación

```bash
npm run migrate:down     # revierte 004: elimina la restricción del teléfono
npm run migrate:status   # 004 aparece como PENDIENTE
npm run migrate:up       # vuelve a aplicar 004
```

Si hay datos que violan la restricción, `migrate:up` falla y no aplica nada (la transacción se revierte). La migración queda pendiente hasta corregir los datos.

### Base existente (producción)

La base de producción se creó antes de usar migraciones. Para incorporarla sin recrear nada:

```bash
npm run migrate:baseline   # registra 001 como aplicada
npm run migrate:up         # aplica 002, 003 y 004
```

Antes de cualquier cambio en producción se debe respaldar la base desde Azure (**Copias de seguridad y restauración**).

## Pruebas

```bash
npm test
```

Las pruebas usan el ejecutor integrado de Node.js y sustituyen los repositorios por mocks; no requieren base de datos. La conexión y el almacenamiento reales deben comprobarse con tu instancia de PostgreSQL.

## Metodología

El proyecto se gestiona con **Scrum** en Jira, organizado en sprints semanales.

Ramas:

- `main` → versión estable
- `develop` → integración
- `feature/nombre-tarea` → desarrollo de cada historia de usuario

## Equipo

- Eduardo Olvera Camacho
- Joel Álvarez Rodríguez
- Isai Axel Hernández Paniagua Francisco

**Asesor:** Juan Carlos Benítez Reyes

## Licencia

Proyecto de uso académico — UTTT, 2026.
