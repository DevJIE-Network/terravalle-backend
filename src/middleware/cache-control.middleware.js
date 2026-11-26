/**
 * Políticas de caché HTTP de la API.
 *
 * - Por defecto ninguna respuesta se guarda (no-store): datos de sesión, contacto del vendedor,
 *   favoritos y cualquier operación que modifica información.
 * - Los datos públicos que pueden cambiar (catálogo, ficha y servicios) se pueden guardar,
 *   pero el navegador debe revalidarlos con el servidor en cada consulta (no-cache + ETag).
 *   Si no cambiaron, el servidor responde 304 sin volver a enviar el cuerpo.
 * - Los errores (404, 410, 500, ...) nunca se guardan.
 */
const CACHE_POLICIES = Object.freeze({
  NO_STORE: 'no-store',
  PUBLIC_REVALIDATE: 'public, no-cache',
});

/** Aplica no-store a todo lo que no declare otra política. */
function noStore(_req, res, next) {
  res.set('Cache-Control', CACHE_POLICIES.NO_STORE);
  next();
}

/** Datos públicos que cambian: se guardan, pero siempre se revalidan. Solo para respuestas 200. */
function publicRevalidate(_req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    res.set(
      'Cache-Control',
      res.statusCode === 200 ? CACHE_POLICIES.PUBLIC_REVALIDATE : CACHE_POLICIES.NO_STORE,
    );
    return sendJson(body);
  };
  next();
}

module.exports = { CACHE_POLICIES, noStore, publicRevalidate };
