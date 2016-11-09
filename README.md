# stage-ci

Realtime staging environments.

## Development

Install project dependencies:

```bash
$ yarn
```

Generate a [GitHub token](https://github.com/settings/tokens) with the *repo*
scope. Set this token in an environment variable:

```bash
$ export GITHUB_TOKEN=123
```

Generate a [Zeit API token](https://zeit.co/account#api-tokens) and set it in an
environment variable:

```bash
$ export NOW_TOKEN=123
```

To enable [Papertrail](https://papertrailapp.com/) logging, set the respective
environment variables:

```bash
$ export PAPERTRAIL_HOST=logs.papertrail.com && PAPERTRAIL_PORT=1234
```

To inject environment variables into the staging deployment, set the `ENVS`
environment variable to a valid JSON object:

```bash
$ export ENVS='{"REDIS_HOST": "my.cache.aws.com", "REDIS_PORT": 1234}'
```

Now start the server:

```bash
$ npm start
```
### Testing GitHub integration

Install [ngrok](https://ngrok.com/) or some other localhost tunnel. Fire it up
and point it to port 3000:

```bash
$ ngrok http 3000
```

Setup a [test repo](https://github.com/zpnk/hello-world) on GitHub and configure
a webhook using the ngrok url. Give it access to the "Pull request" event.

Open a PR on your repo to trigger the webhook. It will also fire on commits
pushed to the PR's branch.

Dev away! :)
