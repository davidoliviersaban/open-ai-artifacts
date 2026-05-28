#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANDOC_BIN="${PANDOC_BIN:-pandoc}"
PDF_ENGINE="${PDF_ENGINE:-tectonic}"
AUTHOR_FR="David-Olivier Saban, avec l'aide de Claude Sonnet 4.6 et GPT-5.5"
AUTHOR_EN="David-Olivier Saban, with the help of Claude Sonnet 4.6 and GPT-5.5"
PDF_HEADER="$SCRIPT_DIR/pdf-header.tex"
TABLE_WIDTHS_FILTER="$SCRIPT_DIR/table-widths.lua"
CHAPTER_PAGEBREAKS_FILTER="$SCRIPT_DIR/chapter-pagebreaks.lua"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

pdf_title_for() {
  case "$(basename "$1")" in
    whitepaper-v3.md)
      printf '%s\n' "La mort du code manuel"
      ;;
    whitepaper-management-summary.md)
      printf '%s\n' "Repenser l'agilité à l'âge des agents"
      ;;
    whitepaper-management-summary.en.md)
      printf '%s\n' "Rethinking Agility In The Age Of Agents"
      ;;
    *)
      printf '%s\n' "$(basename "$1" .md)"
      ;;
  esac
}

pdf_author_for() {
  case "$(basename "$1")" in
    *.en.md)
      printf '%s\n' "$AUTHOR_EN"
      ;;
    *)
      printf '%s\n' "$AUTHOR_FR"
      ;;
  esac
}

generate_pdf() {
  local input_path="$1"
  local output_path="${input_path%.md}.pdf"
  local title
  local author

  if [[ ! -f "$input_path" ]]; then
    printf 'Markdown file not found: %s\n' "$input_path" >&2
    exit 1
  fi

  title="$(pdf_title_for "$input_path")"
  author="$(pdf_author_for "$input_path")"

  "$PANDOC_BIN" "$input_path" \
    -s \
    --metadata "title=$title" \
    --metadata "author=$author" \
    --include-in-header="$PDF_HEADER" \
    --lua-filter="$TABLE_WIDTHS_FILTER" \
    --lua-filter="$CHAPTER_PAGEBREAKS_FILTER" \
    --pdf-engine="$PDF_ENGINE" \
    -o "$output_path"

  printf 'Generated %s\n' "$output_path"
}

main() {
  require_command "$PANDOC_BIN"
  require_command "$PDF_ENGINE"

  if [[ "$#" -eq 0 ]]; then
    set -- \
      "$SCRIPT_DIR/whitepaper-v3.md" \
      "$SCRIPT_DIR/whitepaper-management-summary.md"
  fi

  for markdown_path in "$@"; do
    if [[ "$markdown_path" != /* ]]; then
      markdown_path="$SCRIPT_DIR/$markdown_path"
    fi
    generate_pdf "$markdown_path"
  done
}

main "$@"
