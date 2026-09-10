# Project Guide

## Architecture

This is a mobile-first static site deployed on Netlify. The complete page is rendered from `index.html` without a JavaScript framework or build step.

## Key directories

- `index.html`: page structure, content, metadata, and inline production styles.
- `styles.css`: maintainable copy of the primary visual styles.
- `assets/`: brand and product image assets.
- `.netlify/`: Netlify agent metadata and generated task results.

## Conventions

- Keep the experience optimized for narrow mobile screens first.
- Preserve semantic HTML and accessible image alternative text.
- Keep `index.html` inline styles and `styles.css` synchronized when changing shared rules.
- Use relative asset paths so the site works in local and deployed environments.
- Avoid adding a build system unless a future feature requires one.

## Non-obvious decisions

The uploaded logo is stored as a square PNG after removing the original screenshot's black padding. The square format supports both the visible header brand mark and mobile browser icons.
