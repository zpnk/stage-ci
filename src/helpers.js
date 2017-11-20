const {format, parse} = require('url');

const INVALID_URI_CHARACTERS = /\//g;
const MAXIMUM_URI_CHARACTER_COUNT = 70;
const NOW_URI_POSTFIX = '.now.sh';

exports.createAliasUrl = (repo, ref) => {
  const repoStripped = repo.replace(/[^A-Z0-9]/ig, '-');
  const refStripped = ref.replace(INVALID_URI_CHARACTERS, '-');
  const aliasUrl = `${repoStripped}-${refStripped}`;
  const aliasUrlStripped = aliasUrl.substring(0, (MAXIMUM_URI_CHARACTER_COUNT - NOW_URI_POSTFIX.length)).replace(/-$/, '');
  return `https://${aliasUrlStripped}${NOW_URI_POSTFIX}`;
};

exports.createCloneUrl = (cloneUrl, token) => {
  return format(Object.assign(
    parse(cloneUrl),
    {auth: token}
  ));
};
