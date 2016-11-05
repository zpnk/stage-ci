const path  = require('path');
const bodyParser = require('body-parser');
const server = require('express')();
const git = require('simple-git')();
const {stage} = require('./core');

if (!process.env.GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN must be defined in environment');
}

const DEPLOY_DIR = path.resolve('.deploys');

server.use(bodyParser.json());
server.post('/', (request, response) => {
  const {action, number, pull_request, repository} = request.body;

  if (!['opened', 'synchronize'].includes(action)) return response.sendStatus(204);

  const {user: {login}, title, head} = pull_request;
  const localDirectory = path.join(DEPLOY_DIR, repository.full_name);
  const alias = `https://${repository.name}-${head.ref}.now.sh`;

  console.log(`> PR #${number} "${title}" ${action} by @${login}`);
  console.log(`> Deploying ${head.label}/${head.ref}#${head.sha}`);
  console.log(`> Cloning ${repository.clone_url}...`);

  response.sendStatus(200);

  git.clone(repository.clone_url, localDirectory, [ // TODO: Silence the noise
    '--depth=1',
    `--branch=${head.ref}`
  ], () => {
    console.log('> Syncing commit...');
    git.cwd(localDirectory)  // TODO: Avoid multiple request working on the same localDirectory
      .fetch('origin', head.ref)
      .checkout(head.sha)
      .then(() => stage(localDirectory, {alias}));
      // TODO: Create GitHub status
  });
});

server.listen(process.env.PORT || 3000);
