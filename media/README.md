# README media

These files are documentation assets, not consumer captures or private review data. They live outside the npm package's `files` allowlist to keep installations small. The README uses absolute GitHub image URLs so images also resolve on npm.

- `lenqo-logo.png`: original Lenqo brand lockup, generated with the built-in image generation tool. A screen-frame L and a blue review pin connect the identity to the product. The opaque light background keeps the dark wordmark legible in light and dark README themes.
- `review-catalog.png`: actual Lenqo catalog with the repository's deterministic fixture captures.
- `live-preview.png`: actual local preview with a demonstration comment stored only in ignored fixture data.
- `demo-poster.png`, `lenqo-walkthrough-en.mp4`, and `lenqo-social-ja.mp4`: human-reviewed demonstration videos and the README thumbnail. See [the demos and transcripts](demos.md).

## Recreate the screenshots

Install development dependencies and Chromium, then run `npm run test:prepare`. This regenerates disposable `test-results/fixture` data; do not point it at a consumer project.

In separate terminals, start:

```sh
node tests/fixtures/server.mjs
node bin/lenqo.mjs serve --foreground --root . --config tests/fixtures/lenqo.config.mjs
```

Open `http://127.0.0.1:4410/catalog/` at a 1440 × 960 viewport. Capture Review with both viewports visible. Switch to Preview, open its Review drawer, add a demonstration comment, and capture the saved pin and drawer together. Use Playwright screenshots, not generated UI imagery. Review the resulting images before replacing the checked-in assets.

## Logo generation prompts

Tool: built-in `image_gen`, not the API/CLI fallback. The second prompt edits the first output; it is the version used in the README.

### Initial prompt

```text
Use case: logo-brand
Asset type: production logo banner for the GitHub README of Lenqo, a local-first open source visual review tool.
Primary request: Create an original, professional horizontal brand lockup: a distinctive geometric symbol paired with the exact word "Lenqo" (L-e-n-q-o). The symbol should connect the idea of a screen frame and a pinned review annotation, with an intelligently cut negative space suggesting an L. Confident compact silhouette, not a generic chat bubble.
Style/medium: precision flat graphic design, vector-like edges, editorial developer-tool identity. Carefully balanced optical spacing, bold restrained sans serif lettering.
Scene/backdrop: solid warm off-white, near #f5f4ef. The existing product uses dark ink, blue review pins and a lime local-status signal; use dark ink for the wordmark with one small cobalt-blue accent in the mark.
Composition/framing: wide horizontal canvas, approximately 3:1, logo and wordmark centered together with comfortable but not excessive margins; large enough to read as a README header.
Text (verbatim): "Lenqo"
Constraints: exactly one lockup, no slogan, no other words, no presentation board, no mockup, no 3D, no shadows, no gradients, no sparkles, no robot or mascot. Do not imitate an existing brand.
```

### Final edit prompt

```text
Use case: precise-object-edit
Edit the Lenqo logo image. Preserve the exact "Lenqo" wordmark, screen-frame L symbol, blue review pin, and the overall horizontal composition. Remove the small lime green status dot and its halo entirely. Make all shapes solid flat colors, removing any texture, gradients, shadows, or glow. IMPORTANT: replace the entire transparent background with a fully opaque solid warm off-white #f5f4ef canvas; no transparent pixels anywhere, including letter counters. Keep generous clean margins. This must be a clean professional horizontal README logo banner, not a mockup. No additional text or elements.
```

This is an initial brand asset, not a trademark-clearance claim or an editable vector master.
