const path  = require('path');
const bodyParser = require('body-parser');
const server = require('express')();
const {version} = require('../package.json');
const {stage, sync, github} = require('./core');
const log = require('./logger');

const PORT = process.env.PORT || 3000;
const DEPLOY_DIR = path.resolve('/tmp/.stage-ci');

server.use(bodyParser.json());

server.get('/', (request, response) => {
  response.json({version});
});

server.post('/', async (request, response) => {
  const {success, ref, sha, name, alias, cloneUrl, setStatus} = github(request.body);

  response.sendStatus((success) ? 200 : 204);
  if (!success) return;

  log.info(`> Deploying ${name}@${ref}#${sha} to ${alias}`);
  const localDirectory = path.join(DEPLOY_DIR, name);

  try {
    await setStatus('pending', `Staging at ${alias}`, alias);
    await sync(cloneUrl, localDirectory, {ref, checkout: sha});
    await stage(localDirectory, {alias});
    await setStatus('success', `Staged at ${alias}`, alias);
  } catch (error) {
    log.error(error.stack);
    await setStatus('error', `Could not stage ${alias}`, alias);
  }

  log.info('> Done!');
});

server.listen(PORT, () => {
  log.info(`Sever listening on ${PORT}... `);
});
