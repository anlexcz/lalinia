#!/usr/bin/env bash
set -euo pipefail
umask 077
SOURCE="${LALINIA_SNAPSHOT:-/srv/anlex/lalinia/runtime/snapshot.json}"
DEST="${LALINIA_PUBLISH_REPO:-/srv/anlex/lalinia-publish}"
KEY="${LALINIA_DEPLOY_KEY:-/home/anlex/.ssh/lalinia_deploy}"
export GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes"
exec 9>"$DEST/.git/lalinia-publish.lock"
flock -n 9 || exit 0
cd "$DEST"
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)" || { echo 'Publish checkout is dirty; refusing to overwrite' >&2; exit 1; }
git fetch origin main
git merge --ff-only origin/main
# A dedicated file avoids collisions with the existing gallery workflow.
# Never publish notification state, credentials, or runtime files.
node --input-type=module - "$SOURCE" "$DEST/data/live.json" <<'JS'
import fs from 'node:fs';
const [source,target]=process.argv.slice(2);
const s=JSON.parse(fs.readFileSync(source,'utf8'));
if(s.source!=='official-api-v1'||!Array.isArray(s.captures)||!s.captures.length)throw Error('Invalid snapshot');
const age=Date.now()-Date.parse(s.fetchedAt);
if(!Number.isFinite(age)||age<0||age>180000)throw Error('Stale snapshot');
const body={source:s.source,topology:s.topology,rules:s.rules,checkpoint:s.checkpoint,captures:s.captures,teams:s.teams,metroEvents:s.metroEvents};
let previous;
try{previous=JSON.parse(fs.readFileSync(target,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(previous){const {publishedAt,...old}=previous;if(JSON.stringify(old)===JSON.stringify(body)){console.log('No game data changes');process.exit(0);}}
fs.writeFileSync(target,JSON.stringify({...body,publishedAt:new Date().toISOString()})+'\n',{mode:0o644});
JS
git add -- data/live.json
if git diff --cached --quiet; then
  # Retry a previously committed but unpushed update.
  if [ "$(git rev-list --count origin/main..HEAD)" -gt 0 ]; then git push origin HEAD:main; fi
  exit 0
fi
git -c user.name='La Linia data collector' -c user.email='lalinia-collector@users.noreply.github.com' commit -m 'Update live game data'
git push origin HEAD:main
