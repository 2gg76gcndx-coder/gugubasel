# Static family guides

The homepage remains the content source. `build_guides.py` extracts every published guide into English and German static HTML pages and creates chapter directories, language links, canonical URLs and the sitemap. No client JavaScript or translation service is required to read these pages.

To update after editing `index.html`:

```sh
python -m pip install beautifulsoup4==4.14.3
python scripts/build_guides.py
```

Commit the generated pages, `guide-pages.css`, `index.html` and `sitemap.xml` together. Update `scripts/guide_de.json` when changing guide details. Generation deliberately fails if a detail has no German translation, rather than publishing untranslated German pages. Existing `data-food-de` and `data-evergreen-de` translations are retained from the source. Extend `HEADINGS` for new section labels and `GUIDES` for new published subchapters.

The three empty chapters have usable URLs but `noindex,follow`; they are omitted from the sitemap until they have substantive content. The current 2026 seasonal editions include past dates and are labelled accordingly. Existing source prices and dates are carried over, not newly verified.

The site is published by the existing GitHub Pages deployment. Submit `https://gugubasel.ch/sitemap.xml` in Google Search Console to request discovery. This does not guarantee indexing or ranking.
