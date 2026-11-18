# Tracker product text

When creating, importing or updating product or task description/result content (including requests to fill the tracker through ChatGPT), read and follow [the shared text rules](docs/product-text-format.md). Use only the documented structural styles and color palette. Do not introduce arbitrary font sizes, font families, checkboxes or custom HTML styling. Preserve emoji, links and nested lists.

Update only the requested product or task fields. Read the latest shared data first, preserve unrelated fields/tasks, and verify the saved result. Merely viewing or formatting a preview must not overwrite the shared plan. Product text must render through the sanitizer in dist/product-info.js.
