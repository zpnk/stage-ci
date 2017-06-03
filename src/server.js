const path = require('path');
const bodyParser = require('body-parser');
const server = require('express')();
const Queue = require('promise-queue');
const {version} = require('../package.json');
const {stage, sync, github} = require('./core');
const log = require('./logger');

const PORT = process.env.PORT || 3000;
const DEPLOY_DIR = path.resolve('/tmp/.stage-ci');
const queue = new Queue(1, process.env.STAGE_CI_MAX_QUEUE || 100);

server.use(bodyParser.json());

server.get('/', (request, response) => {
  response.json({version, queue});
});

server.post('/', (request, response) => {
  let result;
  try {
    const {headers, body} = request;
    result = github({headers, body});
  } catch (error) {
    if (error.asJson && error.asJson.error && error.asJson.error.type === 'fatal') {
      response.status(500).send(error.asJson);
      return;
    }
  }
  const {success, ref, sha, name, alias, cloneUrl, setStatus, deploy} = result;
  response.sendStatus((success) ? 200 : 204);
  if (!success) return;

  queue.add(async () => {
    log.info(`> Deploying ${name}@${ref}#${sha} to ${alias}`);
    const localDirectory = path.join(DEPLOY_DIR, name);

    try {
      await deploy();
      await setStatus('pending', 'Staging...');
      await sync(cloneUrl, localDirectory, {ref, checkout: sha});
      await stage(localDirectory, {alias});
      await setStatus('success', 'Deployed to Now', alias);
    } catch (error) {
      log.error(error.stack);
      if (error.response) {
        log.error(error.response.data.message);
        log.error(error.response.data.errors);
        log.error(error.response.data.documentation_url);
      }
      await setStatus('error', 'Error', alias);
    }

    log.info('> Done!');
  });
});

server.listen(PORT, () => {
  log.info(`Server listening on ${PORT}... `);
});
