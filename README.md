# stage-ci

Realtime staging environments.

## Development

Install `now` and project dependencies:

```bash
$ yarn global add now && yarn
```

Generate a [GitHub token](https://github.com/settings/tokens) with the *repo*
scope. Set this token in an environment variable:

```bash
$ export GITHUB_TOKEN=123
```

Install [ngrok](https://ngrok.com/) or some other localhost tunnel. Fire it up
and point it to port 3000:

```bash
$ ngrok http 3000
```

Now start the server:
```bash
$ npm start
```

Setup a [test repo](https://github.com/zpnk/hello-world) on GitHub and configure
a webhook using the ngrok url. Give it access to the "Pull request" event.

Open a PR on your repo to trigger the webhook. It will also fire on commits
pushed to the PR's branch.

Dev away! :)
