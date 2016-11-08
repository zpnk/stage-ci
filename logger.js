const winston = require('winston');
require('winston-papertrail').Papertrail;
const {PAPERTRAIL_HOST, PAPERTRAIL_PORT} = process.env;

if (PAPERTRAIL_HOST && PAPERTRAIL_PORT) {
  const winstonPapertrail = new winston.transports.Papertrail({
    host: PAPERTRAIL_HOST,
    port: PAPERTRAIL_PORT,
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
