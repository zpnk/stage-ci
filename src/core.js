/* eslint-disable camelcase */
const {exec} = require('child_process');
const os = require('os');
const path = require('path');
const {parse} = require('url');
const crypto = require('crypto');
const {fs} = require('mz');
const git = require('simple-git/promise')();
const axios = require('axios');
const log = require('./logger');
const envs = require('./envs');
const {createAliasUrl, createCloneUrl} = require('./helpers');

const {
  GITHUB_TOKEN,
  GITHUB_WEBHOOK_SECRET,
  GITLAB_TOKEN,
  GITLAB_WEBHOOK_SECRET,
  ZEIT_API_TOKEN
} = process.env;

let {NOW_VERSION} = process.env;

if (!GITHUB_TOKEN && !GITLAB_TOKEN) throw new Error('GITHUB_TOKEN and/or GITLAB_TOKEN must be defined in environment. Create one at https://github.com/settings/tokens or https://gitlab.com/profile/personal_access_tokens');
if (!GITHUB_WEBHOOK_SECRET && !GITLAB_WEBHOOK_SECRET) throw new Error('GITHUB_WEBHOOK_SECRET and/or GITLAB_WEBHOOK_SECRET must be defined in environment. Create one at https://github.com/{OWNERNAME}/{REPONAME}/settings/hooks or https://gitlab.com/{OWNERNAME}/{REPONAME}/settings/integration (swap in the path to your repo)');
if (!ZEIT_API_TOKEN) throw new Error('ZEIT_API_TOKEN must be defined in environment. Create one at https://zeit.co/account/tokens');

if (!NOW_VERSION) NOW_VERSION = '8.3.9';

function setup() {
  return new Promise((resolve, reject) => {
    log.info('> Checking for now-cli binary..');
    if (fs.existsSync('./now-cli')) {
      log.info('> now-cli exists, skipping download..');
      return resolve();
    }

    log.info('> now-cli not found..');
    log.info('> Downloading now-cli binary..');

    const type = {
      darwin: 'macos',
      linux: 'linux',
      win32: 'win.exe',
      alpine: 'alpine'
    };

    const nowFile = fs.createWriteStream('./now-cli', {encoding: 'binary', flags: 'a', mode: 0o777});

    nowFile.on('close', () => {
      log.info('> Finished downloading now-cli..');
      return resolve();
    });

    nowFile.on('error', (err) => {
      return reject(err);
    });

    const url = `https://github.com/zeit/now-cli/releases/download/${NOW_VERSION}/now-${type[os.platform()]}`;

    axios({
      method: 'get',
      url,
      responseType: 'stream'
    }).then((response) => {
      response.data.pipe(nowFile);
    }).catch((error) => {
      return reject(error);
    });
  });
}

const now = (cmd='') => {
  const nowBin = path.resolve(__dirname, '..', 'now-cli');
  return `${nowBin} ${cmd} --token ${ZEIT_API_TOKEN}`;
};

function stage(cwd, {alias}) {
  return new Promise((resolve, reject) => {
    let url, aliasError;
    const nowProc = exec(now(envs()), {cwd});
    nowProc.stderr.on('data', (error) => reject(new Error(error)));
    nowProc.stdout.on('data', (data) => {if (!url) url = data;});
    nowProc.stdout.on('close', () => {
      if (!url) return reject(new Error('Deployment failed'));
      log.info(`> Setting ${url} to alias ${alias}`);
      const aliasProc = exec(now(`alias set ${url} ${alias}`), {cwd});
      aliasProc.stderr.on('data', (error) => {aliasError = error;});
      aliasProc.on('close', () => {
        if (aliasError) return reject(new Error(aliasError));
        log.info(`> Alias ready ${alias}`);
        resolve(alias);
      });
    });
  });
}

async function sync(cloneUrl, cloneName, localDirectory, {ref, checkout}) {
  try {
    await fs.stat(localDirectory);
  } catch (error) {
    log.info('> Cloning repository...');
    await git.clone(cloneUrl, localDirectory, ['--depth=1', `--branch=${ref}`]);
  }

  await git.cwd(localDirectory);
  const remoteName = cloneName || 'origin';
  await git.removeRemote(remoteName).catch((error) => {}); // eslint-disable-line no-unused-vars
  await git.addRemote(remoteName, cloneUrl);
  log.info(`> Fetching ${ref} from ${remoteName}...`);
  await git.fetch(remoteName, ref);
  log.info(`> Checking out ${ref}@${checkout}...`);
  await git.checkout(checkout);
}

function UnsafeWebhookPayloadError(language) {
  const asJson = {
    error: {
      type: 'fatal',
      name: 'UNSAFE_WEBHOOK_PAYLOAD',
      message: `We could not cryptograhpically verify the payload sent to the stage-ci webhook from ${language.provider.name}. Make sure your ${language.provider.name} environment variable matches the Secret field in your ${language.provider.name} webhook config ${language.provider.webhookLocationInstructions}.`
    }
  };
  this.message = asJson.error.message;
  this.name = asJson.error.name;
  this.asJson = asJson;
}

function github({headers, body}) {
  // Don't log but give a very specific error. We don't want to fill the logs.
  if (!isGithubRequestCrypographicallySafe({headers, body, secret: GITHUB_WEBHOOK_SECRET}))
    throw new UnsafeWebhookPayloadError({
      provider: {
        name: 'Github',
        environmentVariable: 'GITHUB_WEBHOOK_SECRET',
        webhookLocationInstructions: 'at https://github.com/{OWNERNAME}/{REPONAME}/settings/hooks (swap in the path to your repo)'
      }
    });

  if (!['opened', 'synchronize'].includes(body.action)) return {success: false};

  const {repository, pull_request} = body;
  const {ref, sha} = pull_request.head;
  const {deployments_url} = repository;
  let deploymentId;

  const githubApi = axios.create({
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.ant-man-preview+json, application/json'
    }
  });

  return {
    ref,
    sha,
    success: true,
    name: repository.full_name,
    alias: createAliasUrl(repository.name, ref),
    cloneUrl: createCloneUrl(pull_request.head.repo.clone_url, GITHUB_TOKEN),
    cloneName: pull_request.head.repo.full_name,
    deploy: async () => {
      // https://developer.github.com/v3/repos/deployments/#create-a-deployment-status
      // https://developer.github.com/changes/2016-04-06-deployment-and-deployment-status-enhancements/
      const result = await githubApi.post(deployments_url, {
        ref: sha,
        auto_merge: false,
        required_contexts: [],
        transient_environment: true,
        environment: 'PR staging'
      });
      deploymentId = result.data.id;
    },
    setStatus: (state, description, targetUrl) => {
      log.info(`> Setting GitHub status to "${state}"...`);
      return githubApi.post(`${deployments_url}/${deploymentId}/statuses`, {
        state,
        description,
        environment_url: targetUrl,
        target_url: targetUrl,
        auto_inactive: false
      });
    }
  };
}

function gitlab({headers, body} = {}) {
  if (!isGitLabRequestSafe({headers}))
    throw new UnsafeWebhookPayloadError({
      provider: {
        name: 'Gitlab',
        environmentVariable: 'GITLAB_WEBHOOK_SECRET',
        webhookLocationInstructions: 'at https://gitlab.com/{OWNERNAME}/{REPONAME}/settings/integrations (swap in the path to your repo)'
      }
    });

  if (body.object_kind !== 'merge_request') return {success: false};
  if (!['opened', 'reopened'].includes(body.object_attributes.state)) return {success: false};

  const {object_attributes: {source, source_branch, last_commit: {id}, target, target_project_id}} = body;

  let {web_url} = source;
  web_url = parse(web_url);
  const statuses_url = `${web_url.protocol}//${web_url.hostname}/api/v4/projects/${target_project_id}/statuses/${id}`;

  const gitlabApi = axios.create({
    headers: {
      'PRIVATE-TOKEN': GITLAB_TOKEN
    }
  });

  return {
    ref: source_branch,
    sha: id,
    success: true,
    name: target.path_with_namespace,
    alias: createAliasUrl(source.name, source_branch),
    cloneUrl: createCloneUrl(source.http_url, `gitlab-ci-token:${GITLAB_TOKEN}`),
    setStatus: (state, description, targetUrl) => {
      if (state === 'error')
        state = 'failed';
      log.info(`> Setting GitLab status to "${state}"...`);
      return gitlabApi.post(statuses_url, {
        state,
        description,
        target_url: targetUrl,
        context: 'ci/stage-ci'
      });
    },
    deploy: () => {}
  };
}

function isGithubRequestCrypographicallySafe({headers, body, secret}) {
  const blob = JSON.stringify(body);
  const hmac = crypto.createHmac('sha1', secret);
  const ourSignature = `sha1=${hmac.update(blob).digest('hex')}`;
  const theirSignature = headers['x-hub-signature'];
  const bufferA = Buffer.from(ourSignature, 'utf8');
  const bufferB = Buffer.from(theirSignature, 'utf8');
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function isGitLabRequestSafe({headers}) {
  return headers['x-gitlab-token'] === GITLAB_WEBHOOK_SECRET;
}

module.exports = {
  setup,
  stage,
  sync,
  github,
  gitlab
};
