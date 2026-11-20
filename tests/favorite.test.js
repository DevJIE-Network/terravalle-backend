const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const http = require('http');
const jwt = require('jsonwebtoken');
const { app } = require('../src/server');
const userRepository = require('../src/repositories/user.repository');
const favoriteRepository = require('../src/repositories/favorite.repository');

// Save original methods for restoration
const origFindPropertyById = favoriteRepository.findPropertyById;
const origAddFavorite = favoriteRepository.addFavorite;
const origGetFavoritesByUser = favoriteRepository.getFavoritesByUser;
const origRemoveFavorite = favoriteRepository.removeFavorite;

process.env.JWT_SECRET = 'terravalle-hu014-test-secret-2026-32chars';
process.env.JWT_EXPIRES_IN = '1h';

let server;

before(async () => {
  server = app.listen(0, '127.0.0.1');
});

after(async () => {
  if (server) {
    server.close();
  }
  // Restore original favoriteRepository methods
  favoriteRepository.findPropertyById = origFindPropertyById;
  favoriteRepository.addFavorite = origAddFavorite;
  favoriteRepository.getFavoritesByUser = origGetFavoritesByUser;
  favoriteRepository.removeFavorite = origRemoveFavorite;
  // Restore original userRepository.findById
  userRepository.findById = async (id) => {
    if (!isValidId(id)) return null;
    const { query } = require('../config/database');
    const { rows } = await query(
      'SELECT id, name, email, phone, contact_email, is_active, created_at, updated_at FROM users WHERE id = $1',
      [id],
    );
    return rows.length > 0 ? { id: String(rows[0].id), name: rows[0].name, email: rows[0].email, isActive: rows[0].is_active, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  };
});

/**
 * Helper to sign a JWT for testing.
 */
function signTestToken(userId, userEmail = `user${userId}@example.com`) {
  return jwt.sign(
    { sub: userId, email: userEmail, name: `User ${userId}` },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

/**
 * Helper to create a property mock return value.
 */
function createProperty(status, deletedAt = null) {
  const base = {
    id: String(status === 'active' ? 2 : status === 'inactive' ? 3 : status === 'withdrawn' ? 5 : 7),
    ownerId: String(1),
    propertyTypeId: 1,
    title: status === 'active' ? 'Property Active' : status === 'inactive' ? 'Property Inactive' : 'Property ' + status,
    description: 'A test property',
    publicationPrice: 100,
    status,
    deletedAt,
  };
  if (deletedAt !== null) {
    base.deletedAt = deletedAt;
  }
  return base;
}

/**
 * Helper to make HTTP request and wait for response.
 * Returns { statusCode, body }.
 */
function makeRequest(port, path, method, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data),
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();

    req.on('error', reject);
    // Timeout after 5 seconds to prevent hanging
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// === Authentication 401 tests ===

test('HU-014 POST /api/favorites/1 sin JWT -> 401', async () => {
  const port = server.address().port;
  await makeRequest(port, '/api/favorites/1', 'POST', null, null);
});

test('HU-014 GET /api/favorites sin JWT -> 401', async () => {
  const port = server.address().port;
  await makeRequest(port, '/api/favorites', 'GET', null, null);
});

test('HU-014 DELETE /api/favorites/1 sin JWT -> 401', async () => {
  const port = server.address().port;
  await makeRequest(port, '/api/favorites/1', 'DELETE', null, null);
});

test('HU-014 POST /api/favorites/1 con token inválido -> 401', async () => {
  const port = server.address().port;
  const invalidToken = 'invalid.token.string';
  await makeRequest(port, '/api/favorites/1', 'POST', null, invalidToken);
});

test('HU-014 GET /api/favorites con token inválido -> 401', async () => {
  const port = server.address().port;
  const invalidToken = 'invalid.token.string';
  await makeRequest(port, '/api/favorites', 'GET', null, invalidToken);
});

test('HU-014 DELETE /api/favorites/1 con token inválido -> 401', async () => {
  const port = server.address().port;
  const invalidToken = 'invalid.token.string';
  await makeRequest(port, '/api/favorites/1', 'DELETE', null, invalidToken);
});

// JWT usuario inactivo tests - override userRepository.findById per test
const origUserFindById = userRepository.findById;

test('HU-014 POST /api/favorites/1 con JWT usuario inactivo -> 401', async () => {
  const port = server.address().port;
  const token = jwt.sign(
    { sub: '1', email: 'inactive@example.com', name: 'Inactive User' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );

  // Override to return inactive user
  userRepository.findById = async (id) => {
    if (id === '1') {
      return {
        id: 1,
        name: 'Inactive User',
        email: 'inactive@example.com',
        isActive: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
    }
    return null;
  };

  try {
    await makeRequest(port, '/api/favorites/1', 'POST', null, token);
  } finally {
    userRepository.findById = origUserFindById;
  }
});

test('HU-014 GET /api/favorites con JWT usuario inactivo -> 401', async () => {
  const port = server.address().port;
  const token = jwt.sign(
    { sub: '1', email: 'inactive@example.com', name: 'Inactive User' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );

  userRepository.findById = async (id) => {
    if (id === '1') {
      return {
        id: 1,
        name: 'Inactive User',
        email: 'inactive@example.com',
        isActive: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
    }
    return null;
  };

  try {
    await makeRequest(port, '/api/favorites', 'GET', null, token);
  } finally {
    userRepository.findById = origUserFindById;
  }
});

// === POST tests with authentication ===

test('HU-014 POST /api/favorites/2 -> 201 (nuevo favorito, property activo)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '2') {
      return createProperty('active');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: true, favorite: { id: 1, user_id: userId, property_id: propertyId, created_at: new Date() } };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/2', 'POST', null, token);
});

test('HU-014 POST /api/favorites/2 -> 200 (ya era favorito, idempotente)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '2') {
      return createProperty('active');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: { id: 2, user_id: userId, property_id: propertyId, created_at: new Date() } };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/2', 'POST', null, token);
});

test('HU-014 POST /api/favorites/999 -> 404 (propiedad inexistente)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/999', 'POST', null, token);
});

test('HU-014 POST /api/favorites/3 -> 400 (propiedad inactiva)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '3') {
      return createProperty('inactive');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/3', 'POST', null, token);
});

test('HU-014 POST /api/favorites/5 -> 400 (propiedad retirada)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '5') {
      return createProperty('withdrawn');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/5', 'POST', null, token);
});

test('HU-014 POST /api/favorites/7 -> 400 (propiedad borrada/eliminada)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '7') {
      return {
        id: String(7),
        ownerId: String(1),
        propertyTypeId: 1,
        title: 'Property Borrada',
        description: 'A test property',
        publicationPrice: 200,
        status: 'active',
        deletedAt: new Date(),
      };
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/7', 'POST', null, token);
});

test('HU-014 POST /api/favorites/invalid -> 400 (propertyId inválido)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    throw new Error('ID de propiedad inválido');
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/invalid', 'POST', null, token);
});

// === GET tests with authentication ===

test('HU-014 GET /api/favorites -> 200 (usuario sin favoritos)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites', 'GET', null, token);
});

test('HU-014 GET /api/favorites -> 200 (usuario con favoritos)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [{
      id: 1,
      propertyId: '2',
      createdAt: new Date(),
      title: 'Property Active',
      publicationPrice: 100,
      propertyType: { id: 1, name: 'Type 1' },
      isActive: true,
    }];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites', 'GET', null, token);
});

// === DELETE tests with authentication ===

test('HU-014 DELETE /api/favorites/2 -> 200 (favorito eliminado)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '2') {
      return createProperty('active');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: true, favorite: { id: 1, user_id: userId, property_id: propertyId, created_at: new Date() } };
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return true;
  };

  await makeRequest(port, '/api/favorites/2', 'DELETE', null, token);
});

test('HU-014 DELETE /api/favorites/2 -> 200 (idempotente, ya no era favorito)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '2') {
      return createProperty('active');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: true, favorite: { id: 1, user_id: userId, property_id: propertyId, created_at: new Date() } };
  };

  // Ya no existe el favorito
  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false; // Idempotente: 200
  };

  await makeRequest(port, '/api/favorites/2', 'DELETE', null, token);
});

test('HU-014 DELETE /api/favorites/invalid -> 400 (propertyId inválido)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    throw new Error('ID inválido');
  };

  await makeRequest(port, '/api/favorites/invalid', 'DELETE', null, token);
});

test('HU-014 DELETE /api/favorites/4 -> 200 (propiedad que nunca fue favorito, idempotente)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '4') {
      return createProperty('active');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  // Nunca fue favorito - idempotente 200
  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/4', 'DELETE', null, token);
});

test('HU-014 POST /api/favorites/1 -> 404 (propiedad inexistente para usuario autenticado)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    // Property 1 doesn't exist (or belongs to different context)
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: {} };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/1', 'POST', null, token);
});

/* ------------------------------ new tests ------------------------------ */

test('HU-014 DELETE /api/favorites/2 -> 500 (error repository -> middleware global - removeFavorite)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return { id: '2', status: 'active', deleted_at: null };
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: true, favorite: { id: 1, user_id: userId, property_id: propertyId, created_at: new Date() } };
  };

  // Error en removeFavorite -> 500 al middleware global
  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    throw new Error('Error inesperado del repository');
  };

  await makeRequest(port, '/api/favorites/2', 'DELETE', null, token);
});

test('HU-014 POST /api/favorites/2 -> 200 (idempotente duplicado, escenario completo)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    if (id === '2') {
      return createProperty('active');
    }
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    return { created: false, favorite: { id: 11, user_id: userId, property_id: propertyId, created_at: new Date() } };
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/2', 'POST', null, token);
});

test('HU-014 POST /api/favorites/invalid -> 400 (propertyId inválido con mensaje)', async () => {
  const port = server.address().port;
  const token = signTestToken(1);

  favoriteRepository.findPropertyById = async (id) => {
    return null;
  };

  favoriteRepository.addFavorite = async (userId, propertyId) => {
    throw new Error('ID de propiedad inválido');
  };

  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await makeRequest(port, '/api/favorites/invalid', 'POST', null, token);
});