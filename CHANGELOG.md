# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Template transform that adds `data-ctc-source="<path>:<line>:<column>"` to
  plain HTML and SVG elements in `.hbs`, `.gjs` and `.gts` templates.
- Browser runtime: Option/Alt+Click opens the nearest annotated element in VS
  Code, VS Code Insiders or Cursor, with a hover highlight while Alt is held.
- Option/Alt+Right-click menu listing every annotated ancestor, with keyboard
  navigation.
- `editor`, `attribute` and `open` runtime options, and `enabled` and
  `attribute` transform options.

### Fixed

- Accurate file lines and columns for template-tag files, including templates
  whose common indentation the compiler strips, trimmed templates, and CRLF
  files.
