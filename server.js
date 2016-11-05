const path  = require('path');
const bodyParser = require('body-parser');
const server = require('express')();
const {stage, sync, createStatusSetter} = require('./core');

const DEPLOY_DIR = path.resolve('.deploys');

server.use(bodyParser.json());
server.post('/', async (request, response) => {
  const {action, pull_request, repository} = request.body;

  if (!['opened', 'synchronize'].includes(action)) {
    return response.sendStatus(204);
  }

  const {ref, sha} = pull_request.head;
  const localDirectory = path.join(DEPLOY_DIR, repository.full_name);
  const cloneUrl = repository.clone_url;
  const alias = `https://${repository.name}-${ref}.now.sh`;
  const setStatus = createStatusSetter(request.body);

  response.sendStatus(200);
  console.log(`> Deploying ${cloneUrl}@${ref}#${sha} to ${alias}`);

  try {
    await setStatus('pending', `Staging at ${alias}`, alias);
    await sync(cloneUrl, localDirectory, {ref, checkout: sha});
    await stage(localDirectory, {alias});
    await setStatus('success', `Staged at ${alias}`, alias);
  } catch (error) {
    await setStatus('error', `Could not stage ${alias}`, alias);
  }

  console.log('> Done!');
});

server.listen(process.env.PORT || 3000);
