#!/bin/zsh
# Builds "Edit Portfolio.app" in ~/Applications for the Dock (#617).
#
#   tools/portfolio-editor/make-app.sh            # normal: drafts publish to staging
#   tools/portfolio-editor/make-app.sh --trial BRANCH
#       trial: a separate drafts clone based on BRANCH, publishing turned off
set -eu
src="${0:A:h}"
app="$HOME/Applications/Edit Portfolio.app"
content="$HOME/code/portfolio-content"
base=staging
publish=on
if [[ "${1:-}" == --trial ]]; then
  base="${2:?usage: make-app.sh --trial BRANCH}"
  content="$HOME/code/portfolio-content-trial"
  publish=off
fi

mkdir -p "$HOME/Applications"
rm -rf "$app"
osacompile -o "$app" -e 'do shell script "/bin/zsh -l " & quoted form of (POSIX path of (path to me) & "Contents/Resources/editor/launch.sh") & " >/dev/null 2>&1"'

res="$app/Contents/Resources/editor"
mkdir -p "$res"
cp -R "$src/server.js" "$src/launch.sh" "$src/lib" "$src/public" "$res/"
cat > "$res/config.sh" <<EOF
CONTENT_DIR="$content"
BASE_BRANCH="$base"
PUBLISH=$publish
EOF
chmod +x "$res/launch.sh"

echo "Built: $app"
echo "Drafts folder: $content (based on $base, publishing $publish)"
echo "Drag it from ~/Applications into the Dock."
