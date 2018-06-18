FROM node:10-alpine

ENV GITHUB_TOKEN=$GITHUB_TOKEN \
		GITLAB_TOKEN=$GITLAB_TOKEN \
		ZEIT_API_TOKEN=$ZEIT_API_TOKEN \
		GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET \
		GITLAB_WEBHOOK_SECRET=$GITLAB_WEBHOOK_SECRET \
		PAPERTRAIL_HOST=$PAPERTRAIL_HOST \
		PAPERTRAIL_PORT=$PAPERTRAIL_PORT \
		ENVS=$ENVS

ENV NOW_VERSION=11.2.1

RUN apk add --no-cache git

WORKDIR /stage-ci

RUN wget https://github.com/zeit/now-cli/releases/download/${NOW_VERSION}/now-alpine.gz && gunzip now-alpine.gz && mv now-alpine now-cli && chmod +x now-cli

COPY package.json .
RUN npm install --production

ADD . .

EXPOSE 3000

CMD npm start
