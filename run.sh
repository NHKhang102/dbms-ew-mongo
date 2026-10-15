#!/usr/bin/env bash
# Run the MongoDB demos against Atlas: print to the terminal and save to results/<demo>.txt
#   ./run.sh                   → list the demos
#   ./run.sh check_data        → check the connection and the data
#   ./run.sh demo1 demo2       → run several demos (a unique prefix of the name is enough)
#   ./run.sh live | all | extra
#   ./run.sh shell             → interactive mongosh with the demo helpers loaded (for typing queries live)
#   FULL_NLJ=1 ./run.sh demo2  → also run the unindexed nested-loop join on all reports (slow)
# Each run overwrites results/<demo>.txt; results/SUMMARY.md always holds the latest table of every demo.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$ROOT/results"
MONGOSH="mongosh@2.13.0"
LIVE=(demo1_selection demo2_join demo3_pushdown)
ALL=(check_data "${LIVE[@]}" compound_index plan_cache pipeline_rewrite sort_memory)
EXTRA=(extra_text_search extra_sbe_engine)

usage() {
  echo "Usage: ./run.sh <demo>... | live | all | extra | shell"
  echo
  for f in "$ROOT"/demos/*.js; do
    [[ "$(basename "$f")" == "atlas_compass_queries.js" ]] && continue
    printf "  %-26s %s\n" "$(basename "$f" .js)" "$(head -1 "$f" | sed 's#^// *##')"
  done
  echo
  echo "  live  = ${LIVE[*]}   (the 3 live demos of slide 17)"
  echo "  all   = ${ALL[*]}"
  echo "  extra = ${EXTRA[*]}"
  echo "  shell = interactive mongosh with the demo helpers loaded"
}

# Read one key from .env without `source` (the password may contain special characters)
read_env() {
  local line val
  [[ -f "$ROOT/.env" ]] || return 0
  line="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ROOT/.env" | tail -1)" || return 0
  val="${line#*=}"
  val="$(printf '%s' "$val" | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
  printf '%s' "$val"
}

# Hide user:password if mongosh prints the URI (e.g. in an error message)
redact() { sed -u -E 's#(mongodb(\+srv)?://)[^@/[:space:]]+@#\1***@#g'; }

# Demo name from an argument: exact file name, or a unique prefix ("demo1" → demo1_selection)
resolve() {
  # atlas_compass_queries.js is a standalone copy-paste file for Compass/Atlas Shell, not a runnable demo
  [[ "$1" == atlas_compass_queries* ]] && return 1
  [[ -f "$ROOT/demos/$1.js" ]] && { echo "$1"; return 0; }
  local m=("$ROOT"/demos/"$1"*.js)
  # Filter out atlas_compass_queries if it happens to match a prefix
  local filtered=(); for x in "${m[@]}"; do [[ "$(basename "$x")" != "atlas_compass_queries.js" ]] && filtered+=("$x"); done; m=("${filtered[@]}")
  [[ ${#m[@]} -eq 1 && -f "${m[0]}" ]] && { basename "${m[0]}" .js; return 0; }
  return 1
}

[[ $# -eq 0 ]] && { usage; exit 2; }

demos=()
shell=0
for arg in "$@"; do
  case "$arg" in
    live)  demos+=("${LIVE[@]}") ;;
    all)   demos+=("${ALL[@]}") ;;
    extra) demos+=("${EXTRA[@]}") ;;
    shell) shell=1 ;;
    -h|--help|help) usage; exit 0 ;;
    *) name="$(resolve "$arg")" || { echo "Unknown or ambiguous demo '$arg'."; echo; usage; exit 2; }
       demos+=("$name") ;;
  esac
done

URI="$(read_env MONGODB_URI)"
if [[ -z "$URI" || "$URI" == *"<"* ]]; then
  echo "MONGODB_URI in .env is empty or still has a <...> placeholder. Paste your Atlas connection string into .env (never into a chat)."
  exit 1
fi
if [[ ! "$URI" =~ ^mongodb(\+srv)?:// ]]; then
  echo "MONGODB_URI must start with mongodb:// or mongodb+srv://"
  exit 1
fi
export MONGODB_DB="$(read_env MONGODB_DB)" REPORT_COLL="$(read_env REPORT_COLL)" IMAGE_COLL="$(read_env IMAGE_COLL)"
export FULL_NLJ="${FULL_NLJ:-0}"

command -v npx >/dev/null || { echo "npx not found. Install Node.js (e.g. with nvm), then open a new terminal."; exit 1; }
if ! npx --yes "$MONGOSH" --version >/dev/null 2>&1; then
  echo "Could not download/run $MONGOSH via npx. Check the network, then try: npx --yes $MONGOSH --version"
  exit 1
fi

# Interactive mongosh: helpers from lib/common.js are loaded, the prompt stays open
if [[ $shell -eq 1 ]]; then
  cd "$ROOT" && exec npx --yes "$MONGOSH" "$URI" --quiet --shell --file "$ROOT/lib/common.js" --file "$ROOT/lib/shell_intro.js"
fi

mkdir -p "$RESULTS"
rc=0
for name in "${demos[@]}"; do
  out="$RESULTS/$name.txt"
  echo
  echo "▶ $name  →  ${out#"$ROOT"/}"
  {
    echo "# Demo: $name"
    echo "# Run at: $(date '+%Y-%m-%d %H:%M:%S')"
    npx --yes "$MONGOSH" "$URI" --quiet --file "$ROOT/lib/common.js" --file "$ROOT/demos/$name.js" 2>&1
  } | redact | tee "$out"
  rc=${PIPESTATUS[0]}
  if [[ $rc -ne 0 ]]; then
    if grep -qiE "Authentication ?failed|bad auth|timed out|Server selection|ENOTFOUND|ECONNREFUSED|querySrv" "$out"; then
      {
        echo
        echo "Could not connect to Atlas:"
        echo "- Check the user/password in MONGODB_URI (URL-encode special characters in the password, e.g. @ → %40)."
        echo "- Atlas → Network Access: add this machine's current IP (or 0.0.0.0/0 during the demo)."
      } | tee -a "$out"
    fi
    echo "[$name] stopped with exit code $rc"
    break
  fi
done

# Rebuild SUMMARY.md from the newest output of every demo, in the order of `./run.sh all extra`
{
  echo "# Summary of all demo results"
  echo
  echo "Rebuilt $(date '+%Y-%m-%d %H:%M:%S') from results/*.txt (each section shows when that demo last ran)."
  for name in "${ALL[@]}" "${EXTRA[@]}"; do
    f="$RESULTS/$name.txt"
    [[ -f "$f" ]] && grep -q '^### Summary' "$f" || continue
    echo
    echo "## $name  ($(sed -n 's/^# Run at: //p' "$f"))"
    sed -n '/^### Summary/,$p' "$f" | tail -n +2
  done
} > "$RESULTS/SUMMARY.md"

echo
echo "Results: results/<demo>.txt · overview of every demo: results/SUMMARY.md"
exit "$rc"
