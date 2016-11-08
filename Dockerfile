FROM node:7-slim

RUN apt-get -y update && apt-get -y install git

WORKDIR /stage-ci

COPY package.json .
RUN npm install --production

ADD . .

EXPOSE 3000

CMD npm start
