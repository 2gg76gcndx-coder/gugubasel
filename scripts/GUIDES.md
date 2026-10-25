# Family guide pages

The homepage is the English content source. Run `python scripts/build_guides.py`
to regenerate the 14 English guide and category URLs, stylesheet and sitemap.
No separate German pages are generated. Every English page shares the local
EN/DE switch in `assets/site-features.js` and translations in `assets/site-languages.js`.
English HTML is preserved when returning to EN; the choice persists in this browser.

Items with `data-pin-key` share browser-local saved selections across the homepage
and the guide pages. Standalone pages link back to `/?tab=pinned` for all saved items.
Keys and the language preference are stored locally; no account or remote storage is used.

Keep translated copy current when editing source text. The existing guide translation
source is `scripts/guide_de.json`; `assets/site-languages.js` contains the complete
runtime dictionary, including headings, accessibility labels, events and deals.
Unpublished categories stay as SOON placeholders on the homepage; no empty category directories are published.
