package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// ── TextMate grammar structures ───────────────────────────────────────────────

type TmCapture struct {
	Name string `json:"name"`
}

type TmPattern struct {
	Include       string               `json:"include,omitempty"`
	Match         string               `json:"match,omitempty"`
	Name          string               `json:"name,omitempty"`
	Begin         string               `json:"begin,omitempty"`
	End           string               `json:"end,omitempty"`
	ContentName   string               `json:"contentName,omitempty"`
	BeginCaptures map[string]TmCapture `json:"beginCaptures,omitempty"`
	EndCaptures   map[string]TmCapture `json:"endCaptures,omitempty"`
	Patterns      []TmPattern          `json:"patterns,omitempty"`
}

type TmRepoEntry struct {
	Patterns []TmPattern `json:"patterns"`
}

type TmLanguage struct {
	Schema     string                 `json:"$schema"`
	Name       string                 `json:"name"`
	ScopeName  string                 `json:"scopeName"`
	Patterns   []TmPattern            `json:"patterns"`
	Repository map[string]TmRepoEntry `json:"repository"`
}

// ── Token extraction from ANTLR .g4 ──────────────────────────────────────────

// skipLiterals are ANTLR-specific tokens that have no meaning in tmLanguage.
var skipLiterals = map[string]bool{
	"[": true, "]": true, "[]": true,
	"{": true, "}": true,
	"(": true, ")": true,
	";": true, ",": true, ".": true,
	"/*": true, "*/": true, "@": true,
}

type tokenKind int

const (
	kindSkip tokenKind = iota
	kindKeyword
	kindBackslashFunc // \keyword in ACSL source
	kindLabel         // Here, Old, Pre, Post, …
	kindOperator
)

func categorize(lit string) tokenKind {
	if len(lit) == 0 || skipLiterals[lit] {
		return kindSkip
	}

	// ANTLR escape sequences inside strings: \r \n \t etc. (single \ + one char)
	if lit[0] == '\\' && (len(lit) == 1 || lit[1] != '\\') {
		return kindSkip
	}

	// ACSL backslash builtins: \\keyword in g4 = \keyword in source
	if len(lit) >= 2 && lit[0] == '\\' && lit[1] == '\\' {
		return kindBackslashFunc
	}

	// Word-only literals: labels start with uppercase, keywords with lowercase
	allWord := true
	for _, r := range lit {
		if !unicode.IsLetter(r) && r != '_' {
			allWord = false
			break
		}
	}
	if allWord {
		if unicode.IsUpper(rune(lit[0])) {
			return kindLabel
		}
		return kindKeyword
	}

	return kindOperator
}

// extractTokens scans the .g4 file and returns classified token sets.
// It handles block comments, line comments, and action blocks correctly.
func extractTokens(filename string) (keywords, backslashNames, labels, operators []string, err error) {
	raw, err := os.ReadFile(filename)
	if err != nil {
		return
	}

	text := []rune(string(raw))
	seen := make(map[string]bool)
	var allLiterals []string

	i := 0
	for i < len(text) {
		// Block comment /* ... */
		if i+1 < len(text) && text[i] == '/' && text[i+1] == '*' {
			i += 2
			for i+1 < len(text) && !(text[i] == '*' && text[i+1] == '/') {
				i++
			}
			i += 2
			continue
		}
		// Line comment // ...
		if i+1 < len(text) && text[i] == '/' && text[i+1] == '/' {
			for i < len(text) && text[i] != '\n' {
				i++
			}
			continue
		}
		// Action block { ... } — contains embedded Go code, skip it
		if text[i] == '{' {
			depth := 1
			i++
			for i < len(text) && depth > 0 {
				if text[i] == '{' {
					depth++
				} else if text[i] == '}' {
					depth--
				}
				i++
			}
			continue
		}
		// Single-quoted ANTLR literal
		if text[i] == '\'' {
			i++
			var sb strings.Builder
			for i < len(text) && text[i] != '\'' {
				sb.WriteRune(text[i])
				i++
			}
			i++ // closing quote
			lit := sb.String()
			if !seen[lit] {
				seen[lit] = true
				allLiterals = append(allLiterals, lit)
			}
			continue
		}
		i++
	}

	for _, lit := range allLiterals {
		switch categorize(lit) {
		case kindKeyword:
			keywords = append(keywords, lit)
		case kindBackslashFunc:
			backslashNames = append(backslashNames, lit[2:]) // strip leading \\
		case kindLabel:
			labels = append(labels, lit)
		case kindOperator:
			operators = append(operators, lit)
		}
	}

	sort.Strings(keywords)
	sort.Strings(backslashNames)
	sort.Strings(labels)
	// Longer operators must come first in alternation so they match before shorter prefixes.
	sort.Slice(operators, func(i, j int) bool {
		if len(operators[i]) != len(operators[j]) {
			return len(operators[i]) > len(operators[j])
		}
		return operators[i] < operators[j]
	})
	return
}

// ── Pattern builders ──────────────────────────────────────────────────────────

func wordPattern(words []string) string {
	return `\b(` + strings.Join(words, "|") + `)\b`
}

// backslashPattern builds a regex that matches \name for each extracted name.
// In the JSON the pattern will be stored as \\(name1|name2|…)\b which the
// regex engine interprets as: literal backslash + one of the names.
func backslashPattern(names []string) string {
	// "\\\\" is two backslash characters in Go → "\\\\…" in JSON → regex \\…
	return "\\\\" + "(" + strings.Join(names, "|") + `)\b`
}

func operatorPattern(ops []string) string {
	escaped := make([]string, len(ops))
	for i, op := range ops {
		escaped[i] = regexp.QuoteMeta(op)
	}
	return "(" + strings.Join(escaped, "|") + ")"
}

// ── tmLanguage assembly ───────────────────────────────────────────────────────

// acslCommentBlock returns the begin/end pattern for /*@ … */ ACSL annotations.
func acslCommentBlock(variant string) TmPattern {
	return TmPattern{
		Begin: `/\*` + variant + `@`,
		End:   `\*/`,
		BeginCaptures: map[string]TmCapture{
			"0": {Name: "punctuation.definition.comment.begin.acsl"},
		},
		EndCaptures: map[string]TmCapture{
			"0": {Name: "punctuation.definition.comment.end.acsl"},
		},
		ContentName: "meta.embedded.block.acsl",
		Patterns:    []TmPattern{{Include: "#acsl-content"}},
	}
}

// acslCommentBlockNewline returns the pattern for /*\n@ … */ ACSL annotations.
// This pattern uses nested begin/end to match block comments where @ appears on its own line.
// The outer pattern matches /* followed by any content until @ on its own line.
// The inner pattern matches from @ to */ with ACSL content highlighting.
func acslCommentBlockNewline() TmPattern {
	return TmPattern{
		Begin: `^\s*/\*\s*$`,
		End:   `^(?!@\s*$)|\*/`,
		Name:  "comment.block.acsl.guard",
		BeginCaptures: map[string]TmCapture{
			"0": {Name: "punctuation.definition.comment.begin.acsl"},
		},
		Patterns: []TmPattern{
			{
				Begin: `^@\s*$`,
				End:   `\*/`,
				ContentName: "meta.embedded.block.acsl",
				BeginCaptures: map[string]TmCapture{
					"0": {Name: "punctuation.definition.annotation.acsl"},
				},
				EndCaptures: map[string]TmCapture{
					"0": {Name: "punctuation.definition.comment.end.acsl"},
				},
				Patterns: []TmPattern{{Include: "#acsl-content"}},
			},
		},
	}
}

func acslRepository(keywords, backslashNames, labels, operators []string) map[string]TmRepoEntry {
	repo := map[string]TmRepoEntry{
		"acsl-content": {Patterns: []TmPattern{
			{Include: "#acsl-strings"},
			{Include: "#acsl-numbers"},
			{Include: "#acsl-special-functions"},
			{Include: "#acsl-keywords"},
			{Include: "#acsl-labels"},
			{Include: "#acsl-operators"},
			{Include: "#acsl-identifiers"},
			{Include: "#acsl-punctuation"},
		}},
		"acsl-keywords": {Patterns: []TmPattern{
			{Match: wordPattern(keywords), Name: "keyword.control.acsl"},
		}},
		"acsl-special-functions": {Patterns: []TmPattern{
			{Match: backslashPattern(backslashNames), Name: "support.function.acsl"},
		}},
		"acsl-labels": {Patterns: []TmPattern{
			{Match: wordPattern(labels), Name: "constant.language.acsl"},
			{Match: `\b[a-zA-Z_][a-zA-Z0-9_]*:`, Name: "entity.name.label.acsl"},
		}},
		"acsl-operators": {Patterns: []TmPattern{
			{Match: operatorPattern(operators), Name: "keyword.operator.acsl"},
		}},
		"acsl-identifiers": {Patterns: []TmPattern{
			{Match: `\b[a-zA-Z_][a-zA-Z0-9_]*\b`, Name: "variable.other.acsl"},
		}},
		"acsl-punctuation": {Patterns: []TmPattern{
			{Match: `[;,\.]`, Name: "punctuation.separator.acsl"},
			{Match: `[\[\]{}()]`, Name: "punctuation.bracket.acsl"},
		}},
		"acsl-strings": {Patterns: []TmPattern{
			{
				Begin: `"`, End: `"`,
				Name:     "string.quoted.double.acsl",
				Patterns: []TmPattern{{Match: `\\.`, Name: "constant.character.escape.acsl"}},
			},
		}},
		"acsl-numbers": {Patterns: []TmPattern{
			{Match: `\b(0[xX][0-9a-fA-F]+|0[0-7]+|\d+)\b`, Name: "constant.numeric.acsl"},
			{Match: `\b\d+\.\d+([eE][\+\-]?\d+)?[fFdD]?\b`, Name: "constant.numeric.float.acsl"},
		}},
	}
	return repo
}

func buildPureACSL(keywords, backslashNames, labels, operators []string) TmLanguage {
	return TmLanguage{
		Schema:    "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
		Name:      "ACSL",
		ScopeName: "source.go.acsl",
		Patterns: []TmPattern{
			acslCommentBlock(""),
			acslCommentBlock(`\s+`),
			acslCommentBlockNewline(),
		},
		Repository: acslRepository(keywords, backslashNames, labels, operators),
	}
}

func buildGoACSL(keywords, backslashNames, labels, operators []string) TmLanguage {
	repo := acslRepository(keywords, backslashNames, labels, operators)

	// Go-specific repository entries
	// Order matters: more specific patterns must come first
	repo["comments"] = TmRepoEntry{Patterns: []TmPattern{
		acslCommentBlock(""),
		acslCommentBlock(`\s+`),
		acslCommentBlockNewline(),
		{Match: `//.*`, Name: "comment.line.go"},
		{Begin: `/\*`, End: `\*/`, Name: "comment.block.go"},
	}}
	repo["go-keywords"] = TmRepoEntry{Patterns: []TmPattern{
		{
			Match: `\b(package|import|func|var|const|type|struct|interface|map|chan|go|defer|select|break|case|continue|default|else|fallthrough|for|goto|if|range|return|switch)\b`,
			Name:  "keyword.control.go",
		},
	}}
	repo["go-operators"] = TmRepoEntry{Patterns: []TmPattern{
		{Match: `[+\-*/%&|^=!<>]+`, Name: "keyword.operator.go"},
	}}
	repo["go-identifiers"] = TmRepoEntry{Patterns: []TmPattern{
		{Match: `\b[a-zA-Z_][a-zA-Z0-9_]*\b`, Name: "variable.other.go"},
	}}
	repo["go-strings"] = TmRepoEntry{Patterns: []TmPattern{
		{
			Begin: `"`, End: `"`,
			Name:     "string.quoted.double.go",
			Patterns: []TmPattern{{Match: `\\.`, Name: "constant.character.escape.go"}},
		},
		{Begin: "`", End: "`", Name: "string.quoted.raw.go"},
	}}
	repo["go-numbers"] = TmRepoEntry{Patterns: []TmPattern{
		{Match: `\b\d+\.?\d*\b`, Name: "constant.numeric.go"},
	}}
	repo["go-punctuation"] = TmRepoEntry{Patterns: []TmPattern{
		{Match: `[;,\.:{}()\[\]]`, Name: "punctuation.go"},
	}}

	return TmLanguage{
		Schema:    "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
		Name:      "Go with ACSL",
		ScopeName: "source.acsl",
		Patterns: []TmPattern{
			{Include: "#comments"},
			{Include: "#go-keywords"},
			{Include: "#go-operators"},
			{Include: "#go-identifiers"},
			{Include: "#go-strings"},
			{Include: "#go-numbers"},
			{Include: "#go-punctuation"},
		},
		Repository: repo,
	}
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	grammar := flag.String("grammar", "", "Path to ACSL.g4 (required)")
	output := flag.String("output", "", "Output .tmLanguage.json path (required)")
	includeGo := flag.Bool("include-go", false, "Include Go language syntax (for .go files)")
	flag.Parse()

	if *grammar == "" || *output == "" {
		fmt.Fprintln(os.Stderr, "Usage: grammar-gen -grammar <ACSL.g4> -output <file.tmLanguage.json> [-include-go]")
		os.Exit(1)
	}

	keywords, backslashNames, labels, operators, err := extractTokens(*grammar)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading grammar: %v\n", err)
		os.Exit(1)
	}

	var lang TmLanguage
	if *includeGo {
		lang = buildGoACSL(keywords, backslashNames, labels, operators)
	} else {
		lang = buildPureACSL(keywords, backslashNames, labels, operators)
	}

	f, err := os.Create(*output)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error creating output file: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(lang); err != nil {
		fmt.Fprintf(os.Stderr, "error marshaling JSON: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("generated %s\n", *output)
}
