#!/bin/zsh
cd "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js 24 first, then open this launcher again.'
  read '?Press Enter to close.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || exit 1
fi
if [[ ! -f dist/index.html ]]; then
  npm run build || exit 1
fi
print 'Open http://127.0.0.1:2567 in your browser. Keep this window open while playing.'
exec npm run server
