const {format, parse} = require('url');

const INVALID_URI_CHARACTERS = /\//g;
const MAXIMUM_URI_CHARACTER_COUNT = 62;

exports.createAliasUrl = (repo, ref) => {
  const repoStripped = repo.replace(/[^A-Z0-9]/ig, '-');
  const refStripped = ref.replace(INVALID_URI_CHARACTERS, '-');
  const aliasUrl = `${repoStripped}-${refStripped}`;
  const aliasUrlStripped = aliasUrl.substring(0, MAXIMUM_URI_CHARACTER_COUNT).replace(/-$/, '');
  return `https://${aliasUrlStripped}.now.sh`;
};

exports.createCloneUrl = (cloneUrl, token) => {
  return format(Object.assign(
    parse(cloneUrl),
    {auth: token}
  ));
};
