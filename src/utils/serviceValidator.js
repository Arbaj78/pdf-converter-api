// src/utils/serviceValidator.js
const ALLOWED_SERVICES = ['window', 'roofing', 'solar', 'remodel'];

function validateService(service) {
  if (!service) {
    throw new Error('Service is required');
  }

  const normalized = service.toLowerCase();

  if (!ALLOWED_SERVICES.includes(normalized)) {
    throw new Error('Invalid service');
  }

  return normalized;
}

module.exports = { validateService };
