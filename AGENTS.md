# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

VSCode extension for syntax highlighting ANSI/ISO C Specification Language (ACSL) annotations in Go files. The extension is built using a grammar generator that converts ANTLR4 grammars to TextMate grammar format.

## Build Commands

- `npm run generate` - Generate TextMate grammar files from ANTLR4 grammar (requires Go 1.21+)
  - Runs Go tool in `tools/grammar-gen/` directory
  - Reads from `vendor/go-specification-lang/framework/gosl/front/grammar/ACSL.g4`
  - Outputs to `syntaxes/acsl.tmLanguage.json`, `syntaxes/go-acsl.tmLanguage.json`, `syntaxes/go-with-acsl.tmLanguage.json`
- `npm run build` - Generate grammars and package extension as `.vsix` file
- `npx vsce package` - Package extension (use `--allow-missing-repository` flag if needed)

## Development

- Press `F5` in VSCode to launch extension in development mode (opens new window with extension loaded)
- Extension uses `.vscode/launch.json` configuration for debugging
- No test framework configured - tests must be added manually

## Critical Architecture

- **Grammar Generation**: The `tools/grammar-gen/main.go` tool parses ANTLR4 `.g4` grammar files and generates TextMate grammar JSON files
- **Submodule Dependency**: `vendor/go-specification-lang` is a git submodule containing the ANTLR4 grammar files
- **Language Support**: Extension supports three language modes:
  - `acsl` (`.acsl` files) - Pure ACSL syntax
  - `go-acsl` (`.go.acsl` files) - Go with ACSL annotations
  - Both use same grammar files but different configurations

## Non-Obvious Patterns

- Grammar generator categorizes tokens into: keywords, backslash functions (`\keyword`), labels (uppercase start), operators
- ANTLR escape sequences (`\r`, `\n`, etc.) are skipped during grammar generation
- ACSL backslash builtins use double backslash in `.g4` files (`\\keyword`) but single backslash in source code (`\keyword`)
- Three separate grammar files are generated but `go-with-acsl.tmLanguage.json` is a copy of `go-acsl.tmLanguage.json`
- File extension `.go.acsl` is used for Go files with ACSL annotations (not standard `.go` extension)

## Gotchas

- The `syntaxes/` directory is empty by default - grammar files must be generated first via `npm run generate`
- Grammar generation requires the git submodule to be initialized and cloned
- Standard `.go` files won't show ACSL highlighting unless language is manually switched to "Go with ACSL" or files are renamed to include "acsl" in the name
- No automated tests exist - manual testing required via F5 development mode