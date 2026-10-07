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

🚧 **En desarrollo.** La base del servidor incluye conexión a MongoDB y registro de usuarios. El inicio de sesión, las sesiones/tokens y las demás funcionalidades todavía no están implementados.

## Estructura

```text
terravalle-backend/
├── src/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   └── auth.controller.js
│   ├── models/
│   │   └── User.js
│   ├── routes/
│   │   └── auth.routes.js
│   ├── schemas/
│   │   └── auth.schema.js
│   └── server.js
├── tests/
│   └── auth.test.js
├── .env
├── .env.example
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

## Tecnologías

Node.js (CommonJS), Express 5, MongoDB con Mongoose, Zod para validación, bcryptjs para hash de contraseñas, CORS y dotenv. Nodemon se utiliza durante el desarrollo.

## Instalación y ejecución

Requisitos: **Node.js 20.19 o superior**, npm y una instancia de MongoDB local o en Atlas.

```bash
npm install
```

Copia `.env.example` a `.env` si este último no existe y ajusta sus valores:

| Variable | Uso | Valor de ejemplo |
| --- | --- | --- |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `PORT` | Puerto HTTP | `3000` |
| `MONGODB_URI` | Conexión a MongoDB | `mongodb://127.0.0.1:27017/terravalle` |
| `CORS_ORIGIN` | Origen permitido del frontend | `http://localhost:5173` |

`.env` es configuración local y no se versiona. No añadas credenciales reales a `.env.example`.

```bash
npm run dev
```

Para ejecutar sin recarga automática, utiliza `npm start`. El servidor se inicia únicamente después de conectarse a MongoDB y preparar el índice de correo único.

## Endpoints disponibles

### `GET /api/health`

Comprueba que el servidor HTTP responde: `{"status":"ok"}`. No es una comprobación de disponibilidad de MongoDB.

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

## Pruebas

```bash
npm test
```

Las pruebas usan el ejecutor integrado de Node.js y sustituyen la persistencia por mocks; no requieren MongoDB. La conexión y el almacenamiento reales deben comprobarse con tu instancia de MongoDB.

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
