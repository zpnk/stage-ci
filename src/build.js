const {setup} = require('./core');
const log = require('./logger');

setup().catch((error) => {
  log.error(error);
  throw error;
});
