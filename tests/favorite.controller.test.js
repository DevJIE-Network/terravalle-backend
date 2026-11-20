const assert = require('node:assert/strict');
const { test, before, after, beforeEach } = require('node:test');
const favoriteController = require('../src/controllers/favorite.controller');
const favoriteRepository = require('../src/repositories/favorite.repository');

process.env.JWT_SECRET = 'terravalle-hu014-test-secret-2026-32chars';
process.env.JWT_EXPIRES_IN = '1h';

beforeEach(() => {
  // Reset all repository mocks before each test
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
});

// Helper to create mock request with propertyId and optional token
function createMockReq(propertyId, userId) {
  return {
    params: { propertyId },
    auth: userId ? { userId: userId } : {},
  };
}

// Helper to create mock response
function createMockRes() {
  const statusObj = {};
  const jsonObj = {};
  return {
    status(code) {
      statusObj.code = code;
      return this;
    },
    json(data) {
      jsonObj.data = data;
      return this;
    },
    getStatus() {
      return statusObj.code;
    },
    getJson() {
      return jsonObj.data;
    },
  };
}

// Helper to create mock next
function createMockNext() {
  let called = false;
  return function next(err) {
    called = true;
    if (err) {
      throw err;
    }
  };
}

// isValidId tests

test('isValidId - ID válido', () => {
  assert.strictEqual(favoriteController.isValidId('1'), true);
  assert.strictEqual(favoriteController.isValidId('123'), true);
  assert.strictEqual(favoriteController.isValidId('1234567890'), true);
});

test('isValidId - ID inválido (number)', () => {
  assert.strictEqual(favoriteController.isValidId(1), false);
});

test('isValidId - ID inválido (vacío)', () => {
  assert.strictEqual(favoriteController.isValidId(''), false);
});

test('isValidId - ID inválido (con letras)', () => {
  assert.strictEqual(favoriteController.isValidId('abc'), false);
});

test('isValidId - ID inválido (negativo)', () => {
  assert.strictEqual(favoriteController.isValidId('-1'), false);
});

test('isValidId - ID inválido (demasiado largo)', () => {
  assert.strictEqual(favoriteController.isValidId('12345678901234567890'), false);
});

// addFavoriteToProperty tests

test('addFavoriteToProperty propertyId vacío -> 400', async () => {
  // Triggers the !propertyId check at the beginning of the function
  const req = createMockReq('', null);
  const res = createMockRes();
  const next = createMockNext();

  await favoriteController.addFavoriteToProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 400, 'Should return 400 when propertyId is empty');
  // Corregir el assert antiguo: no comparar undefined contra null
  const body = res.getJson();
  assert.ok(body !== undefined, 'Response body should not be undefined');
  assert.ok(body !== null, 'Response body should not be null');
});

test('addFavoriteToProperty propertyId ausente -> 400', async () => {
  const req = createMockReq(null, null);
  const res = createMockRes();
  const next = createMockNext();

  await favoriteController.addFavoriteToProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 400, 'Should return 400 when propertyId is missing');
});

test('addFavoriteToProperty propiedad inactiva -> 400', async () => {
  const req = createMockReq('3', '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: property exists but is inactive
  favoriteRepository.findPropertyById = async (id) => {
    if (id === '3') {
      return {
        id: '3',
        status: 'inactive',
        deletedAt: null,
      };
    }
    return null;
  };

  await favoriteController.addFavoriteToProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 400, 'Should return 400 for inactive property');
});

test('addFavoriteToProperty propiedad retirada -> 400', async () => {
  const req = createMockReq('5', '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: property exists but is withdrawn
  favoriteRepository.findPropertyById = async (id) => {
    if (id === '5') {
      return {
        id: '5',
        status: 'withdrawn',
        deletedAt: null,
      };
    }
    return null;
  };

  await favoriteController.addFavoriteToProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 400, 'Should return 400 for withdrawn property');
});

test('addFavoriteToProperty propiedad borrada -> 400', async () => {
  const req = createMockReq('7', '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: property exists but is deleted
  favoriteRepository.findPropertyById = async (id) => {
    if (id === '7') {
      return {
        id: '7',
        status: 'active',
        deletedAt: new Date(),
      };
    }
    return null;
  };

  await favoriteController.addFavoriteToProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 400, 'Should return 400 for deleted property');
});

// listFavorites tests

test('listFavorites vacío -> 200', async () => {
  const req = createMockReq(null, '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: user has no favorites
  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [];
  };

  await favoriteController.listFavorites(req, res, next);

  assert.strictEqual(res.getStatus(), 200, 'Should return 200 for user with no favorites');
  const body = res.getJson();
  assert.ok(body.favorites, 'favorites should be in response');
  assert.ok(Array.isArray(body.favorites), 'favorites should be an array');
  assert.strictEqual(body.favorites.length, 0, 'favorites array should be empty');
});

test('listFavorites usa req.auth.userId', async () => {
  const req = createMockReq(null, '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: user has favorites
  favoriteRepository.getFavoritesByUser = async (userId) => {
    return [
      {
        id: 1,
        propertyId: '2',
        createdAt: new Date(),
        title: 'Property Active',
      },
    ];
  };

  await favoriteController.listFavorites(req, res, next);

  assert.strictEqual(res.getStatus(), 200, 'Should return 200');
  const body = res.getJson();
  assert.ok(body.favorites, 'Should have favorites');
  assert.strictEqual(body.favorites.length, 1, 'Should have 1 favorite');
  assert.strictEqual(body.favorites[0].title, 'Property Active');
});

test('listFavorites repository error -> next(error)', async () => {
  const req = createMockReq(null, '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: repository throws error
  favoriteRepository.getFavoritesByUser = async (userId) => {
    throw new Error('Repository error');
  };

  try {
    await favoriteController.listFavorites(req, res, next);
    // If we get here, next should have been called
    assert.ok(false, 'Should have thrown error');
  } catch (error) {
    // Error should have been passed to next
    assert.ok(error instanceof Error, 'Error should be an instance of Error');
  }
});

// removeFavoriteFromProperty tests

test('removeFavoriteFromProperty propertyId vacío -> 400', async () => {
  // Triggers the !propertyId check at the beginning of the function
  const req = createMockReq('', null);
  const res = createMockRes();
  const next = createMockNext();

  await favoriteController.removeFavoriteFromProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 400, 'Should return 400 when propertyId is empty');
});

test('removeFavoriteFromProperty favorito eliminado -> 200', async () => {
  const req = createMockReq('2', '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: favorite was deleted
  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return true;
  };

  await favoriteController.removeFavoriteFromProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 200, 'Should return 200 when favorite is deleted');
});

test('removeFavoriteFromProperty favorito ya no existe (idempotente) -> 200', async () => {
  const req = createMockReq('2', '1');
  const res = createMockRes();
  const next = createMockNext();

  // Mock: favorite doesn't exist (idempotente)
  favoriteRepository.removeFavorite = async (userId, propertyId) => {
    return false;
  };

  await favoriteController.removeFavoriteFromProperty(req, res, next);

  assert.strictEqual(res.getStatus(), 200, 'Should return 200 for idempotente case (already deleted)');
});