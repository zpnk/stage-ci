const winston = require('winston');
require('winston-papertrail').Papertrail;
const {name} = require('./package.json');
const {PAPERTRAIL_HOST, PAPERTRAIL_PORT} = process.env;

if (PAPERTRAIL_HOST && PAPERTRAIL_PORT) {
  const winstonPapertrail = new winston.transports.Papertrail({
    host: PAPERTRAIL_HOST,
    port: PAPERTRAIL_PORT,
    hostname: name,
    handleExceptions: true,
    json: true
  });

  const logger = new winston.Logger({
    transports: [winstonPapertrail],
    exitOnError: false
  });

  module.exports = logger;
} else {
  module.exports = console;
}
