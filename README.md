# ACSL Syntax Highlighting for VSCode

VSCode extension providing syntax highlighting for ANSI/ISO C Specification Language (ACSL) annotations in Go files.

## Features

- Syntax highlighting for ACSL annotations in `/*@ ... */` comments
- Support for all ACSL keywords and constructs:
  - Contract clauses: `requires`, `assigns`, `ensures`, `behavior`, `assumes`
  - Loop annotations: `loop invariant`, `loop variant`, `loop assigns`
  - Memory predicates: `\valid`, `\valid_read`, `\allocable`, `\freeable`, `\fresh`, `\initialized`, `\separated`
  - Logical operators: `&&`, `||`, `==>`, `<==>`, `^^`
  - Special functions: `\result`, `\old`, `\len`, `\nothing`, `\null`, etc.
  - Labels: `Here`, `Old`, `Pre`, `Post`, `LoopEntry`, `LoopCurrent`, `Init`
- Color-coded syntax for better readability

## Prerequisites

- Node.js (v14 or higher)
- npm
- VSCode with VSCode Command Line Tools (`code` command)

## Installation

### From Source (Recommended)

1. Clone this repository
2. Navigate to the extension directory:
   ```bash
   cd vscode-acsl
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Package the extension:
   ```bash
   npx @vscode/vsce package --allow-missing-repository
   ```
5. Install the extension:
   ```bash
   code --install-extension acsl-syntax-highlighting-0.1.0.vsix --force
   ```
6. Reload VSCode (Ctrl+Shift+P → "Developer: Reload Window")

### Alternative: Development Mode

1. Clone this repository
2. Open the `vscode-acsl` folder in VSCode
3. Press `F5` to open a new window with the extension loaded for testing

### Manual Installation

1. Copy the `vscode-acsl` folder to your VSCode extensions directory
2. Reload VSCode

### Verification

After installation, verify the extension is loaded:
```bash
code --list-extensions | grep acsl
```

Should output: `go-specification-lang.acsl-syntax-highlighting`

### Using ACSL in .go files

Since VSCode's built-in Go grammar processes comments before our extension can inject ACSL highlighting, there are several ways to use ACSL highlighting in regular `.go` files:

#### Option 1: File Associations (Recommended)

Create a `.vscode/settings.json` in your workspace:

```json
{
  "files.associations": {
    "**/*with-acsl*.go": "go-acsl",
    "**/*acsl*.go": "go-acsl"
  }
}
```

Then rename your Go files to include "acsl" in the name, e.g., `main.go` → `main-acsl.go`.

#### Option 2: Manual Language Switching

1. Open a `.go` file with ACSL comments
2. Click on the language indicator in the bottom-right corner (shows "Go")
3. Search for "Go with ACSL" and select it

#### Option 3: Use .acsl files

Simply rename your files to `.acsl` extension - they will automatically use ACSL highlighting.

## Usage

The extension provides ACSL syntax highlighting for several file types:

### File Types Supported:

1. **`.acsl` files** - Automatic ACSL + Go highlighting
2. **`.go.acsl` files** - Automatic ACSL + Go highlighting
3. **`.go` files with special names** - Automatic highlighting (see below)
4. **Any `.go` file** - Manual language switching required

### Automatic Language Detection:

Files matching these patterns automatically get ACSL highlighting:
- `*acsl*.go` (e.g., `clamp_acsl.go`, `main_acsl.go`)
- `*spec*.go` (e.g., `clamp_spec.go`, `utils_spec.go`)
- `*contract*.go` (e.g., `api_contract.go`)

### Manual Language Switching for .go files:

1. Open a `.go` file with ACSL comments
2. Click the language indicator in the bottom-right corner (shows "Go")
3. Search for "ACSL" or "Go with ACSL" and select it

### Why Not All .go Files?

VSCode cannot automatically detect language based on file content. Language is determined by:
- File extension
- File name patterns (filenamePatterns in extension)
- Manual user selection
- Workspace settings (.vscode/settings.json)

This prevents conflicts with normal Go development while allowing ACSL highlighting when needed.

### ACSL Comment Format:

ACSL annotations should be written in comments starting with `/*@`:

```go
/*@
requires bound: lower < upper;
assigns \nothing;
ensures bound: lower <= \result <= upper;

behavior lower_bound:
	assumes v < lower;
	assigns \nothing;
	ensures result: \result == lower;
behavior between:
	assumes lower <= v <= upper;
	assigns \nothing;
	ensures result: \result == v;
behavior upper_bound:
	assumes upper < v;
	assigns \nothing;
	ensures result: \result == upper;
complete behaviors;
disjoint behaviors;
*/
```

## Supported ACSL Constructs

### Contract Clauses
- `requires` - Preconditions
- `assigns` - Memory locations that may be modified
- `ensures` - Postconditions
- `terminates` - Termination conditions
- `decreases` - Variant for termination

### Behaviors
- `behavior` - Named behavior blocks
- `assumes` - Behavior assumptions
- `complete behaviors` - Completeness specification
- `disjoint behaviors` - Disjointness specification

### Loop Annotations
- `loop invariant` - Loop invariants
- `loop variant` - Loop variants
- `loop assigns` - Loop frame conditions

### Memory Predicates
- `\valid`, `\valid_read` - Validity predicates
- `\allocable`, `\freeable` - Allocation predicates
- `\fresh`, `\initialized` - Initialization predicates
- `\separated` - Separation predicate

### Special Functions
- `\result` - Function return value
- `\old(expr)` - Value at function entry
- `\len(expr)` - Length of array/block
- `\nothing` - Empty set of locations
- `\null` - Null pointer

### Operators
- Logical: `&&`, `||`, `==>`, `<==>`, `^^`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Bitwise: `&`, `|`, `^`, `<<`, `>>`

## Development

To contribute or modify the syntax highlighting:

1. Edit `syntaxes/acsl.tmLanguage.json` - TextMate grammar file
2. Edit `language-configuration.json` - Language configuration
3. Test by pressing `F5` in VSCode

### Rebuilding the Extension

When making changes to the extension:

```bash
cd vscode-acsl
npx @vscode/vsce package --allow-missing-repository
code --install-extension acsl-syntax-highlighting-0.1.0.vsix --force
```

Then reload VSCode to see the changes.