const crypto = require('crypto');

const generateRandomInteger = (min = 100_000, max = 999_999) => {
  return crypto.randomInt(min, max);
};

module.exports = {
    generateRandomInteger,
};