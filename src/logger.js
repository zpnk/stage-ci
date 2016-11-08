const winston = require('winston');
const {PAPERTRAIL_HOST, PAPERTRAIL_PORT} = process.env;

if (PAPERTRAIL_HOST && PAPERTRAIL_PORT) {
  require('winston-papertrail').Papertrail;

  const winstonPapertrail = new winston.transports.Papertrail({
    host: PAPERTRAIL_HOST,
    port: PAPERTRAIL_PORT,
    handleExceptions: true,
    colorize: true
  });

  module.exports = new winston.Logger({
    transports: [winstonPapertrail],
    exitOnError: false
  });
} else {
  module.exports = console;
}
