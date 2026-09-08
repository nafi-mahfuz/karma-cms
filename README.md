# Karma CMS + Astro

Two independent applications, one repository. Node 22.12+ is required.

```sh
npm install                    # Astro dependencies
npm install --prefix tools/cms # optional local CMS dependencies
npm run dev                    # Astro website, normally localhost:4321
npm run cms                    # Karma CMS, http://localhost:4000
npm run build                  # static Astro website → dist/
```

For a background Astro server use `npm run dev -- --background`. Manage it with `npm run astro -- dev status`, `npm run astro -- dev logs`, and `npm run astro -- dev stop`. The CMS runs in its own terminal; Ctrl+C stops it. Restart it after changing its server code or configuration. Port 4000 must be available; it never silently chooses another port.

## Content belongs to Astro

`src/content.config.ts` defines the blog collection using Astro's glob loader. Files live in `src/content/blog/**/*.mdx` and work with or without Karma CMS. Content is authored as [MDX](https://docs.astro.build/en/guides/integrations-guide/mdx/) (the `@astrojs/mdx` integration is enabled), so an article body is Markdown that may also embed Astro/React components. Karma edits the Markdown prose visually; embed and edit components through the Markdown source mode.

```yaml
---
title: My story
description: A short introduction
pubDate: 2026-09-08
draft: true
tags:
  - Notes
---
```

The body is standard Markdown (within MDX). Published articles (`draft: false`) appear on the home page and `/blog/<slug>/` (falling back to the file ID for older articles). Saved drafts are available at their article URLs only in the Astro development server, with a draft banner and noindex metadata. They are excluded from the home page and production output. Publishing changes the file; rebuild the website to update deployed output. No deployment happens through the CMS.

The public site is a small journal example. Its collection, schema, pages, and content live entirely in `src/`, with no CMS imports. See [Astro content collections](https://docs.astro.build/en/guides/content-collections/) for the underlying format.

## Local editor

- Search title, filename, description, category, and tags. Combine draft/published status with category or Uncategorized filtering. Sort by recent updates, publication date (newest/oldest), or title (A–Z/Z–A). Empty and no-results views include a clear-filters action.
- Create, read, edit, duplicate, rename, and delete MDX articles (`.mdx`). Duplicate creates a draft with a “(copy)” title and preserves the source file, body, and extra frontmatter. Both duplication and renaming reject existing filenames, including capitalization collisions.
- Edit title, slug, description, body, publication date, category, tags, status, featured image URL/site path and alt text, SEO title, and meta description. SEO fields fall back to the article title and description. Slugs generate from the title until manually edited; existing slugs stay stable. Changing a slug preserves the MDX filename; update inbound links yourself.
- Tiptap visual editor (the official [Simple Editor](https://tiptap.dev/docs/ui-components/templates/simple-editor) toolbar): headings, bold, italic, underline, strike, inline code, highlight, superscript/subscript, bullet/ordered/task lists, text alignment (left/center/right/justify), links, images, quotes, code blocks, undo/redo.
- Formatting is written back as portable, safe output: standard Markdown and GFM where it exists, and a fixed whitelist of semantic HTML for marks that Markdown lacks — `<u>`, `<sup>`, `<sub>`, `<mark>`, and `class="align-*"` for alignment (never inline `style`, which MDX rejects). The toolbar can only emit this closed vocabulary, so no scripts, event handlers, or arbitrary HTML are produced. A round-trip test (`tests/roundtrip.test.ts`) guards that every feature survives save/reload.
- Visual editing opens by default. Markdown source mode remains available for raw HTML, custom directives, footnotes, or other syntax outside the rich editor. Visual edits can normalize complex Markdown; opening an article alone does not rewrite its body.
- Saving without changes preserves exact bytes and file modification time, including omitted optional fields. Metadata edits patch only changed YAML value ranges; unrelated comments, spacing, quotes, line endings, timestamps, and Markdown remain unchanged. Unsupported anchored/aliased field edits or flow-style metadata edits fail without writing; use your code editor for those fields. Additional custom fields are edited through your code editor in v1.
- Save draft explicitly sets draft status; Publish / Update article saves as published. A title, unique valid slug, valid date and a body for publishing are required. Dates are editorial metadata, not scheduling. Saved articles have an Astro preview link; save changes before previewing. Save is explicit, with unsaved-change prompts. Reload from disk reads external changes. Refresh the library to discover external additions/deletions. There is no autosave or automatic file-list watcher.
- Conflicting revisions are rejected on saves and deletes. Writes use a temporary sibling file and atomic rename; competing CMS operations are serialized. A separate external writer should not modify the same file during the final rename window.
- Deletion is permanent after confirmation; use version control for recovery. Rename requires confirmation and warns that the public URL may change (articles with an explicit slug keep their URL). Rename and duplicate stay in the same directory to preserve relative links/images. Update inbound links yourself after a rename. Case-only renames are rejected; use a distinct intermediate name if necessary. Save or discard editor changes before duplicating or renaming.
- Malformed articles are reported separately, without hiding valid articles.

`cms.config.ts` controls repository-relative `contentDir` and `mediaDir` paths plus the website link. Defaults are `src/content/blog` and `public/media`. Both directories must exist and be readable/writable; startup reports missing directories, file paths, symlinks, or paths outside the repository with an actionable error. The media path is configuration only in Milestone 1; uploads and a media browser are not included. The CMS assumes the field names above; if you change Astro's schema, adapt the CMS field mapping and validation accordingly. Existing nested MDX files are supported when path segments contain letters, numbers, underscores, and hyphens. New articles are created at the collection root as `.mdx`; use Rename file in the article details for safe renaming within its folder. Karma reads and writes only `.mdx`; plain `.md` files are not managed by the CMS. Visual editing of embedded MDX components (a component picker, inline component editing), scheduling, databases, authentication, cloud integrations, and schema discovery are outside v1.

## Separation and local access

```
src/content.config.ts       Astro-owned schema
src/content/blog/           Portable Markdown content
src/pages/                 Public Astro routes
cms.config.ts              CMS-only configuration
tools/cms/
  client/                  React UI + CSS
  components/              File-operation confirmation dialog
  editor/                  Tiptap editor
  server/                  Hono API + Vite middleware + filesystem store
  lib/                     CMS types
  tests/                   Filesystem and API tests
  package.json             Separate dependency manifest and lockfile
```

The CMS binds only to `127.0.0.1:4000`. Host and Origin checks reject foreign web pages and DNS rebinding; mutations require a JSON request and custom header. No authentication service is used. Paths and symlinks are checked, and API bodies are limited to 2 MB. Vite serves only the local CMS source area. Do not expose this development server through a public proxy or tunnel.

`npm run build` invokes only Astro. CMS UI, server, API, React and Tiptap dependencies are outside the Astro source/build graph. The Astro application and blog content continue to work unchanged. The production install does not need the nested CMS dependencies.

## Install and remove (CLI)

Karma ships a small CLI (`tools/cms/bin/karma-cms.mjs`, the `karma-cms` bin) for adding and removing the CMS in an Astro project.

```sh
karma-cms init          # scaffold the CMS into the current project
karma-cms init --dry-run # print what init would do, changing nothing
karma-cms remove        # uninstall the CMS, keeping everything you created
```

`init` vendors the CMS source into `tools/cms/`, creates `cms.config.ts` if absent, ensures `src/content/blog` and `public/media` exist, and registers the `cms`, `cms:check`, and `cms:test` scripts in `package.json`. It records what it did in `.karma-cms-install.json`. It never overwrites files that already exist, so re-running it is safe. After `init`, run `npm install --prefix tools/cms` and then `npm run cms`.

`remove` reverses exactly that: it deletes `tools/cms/`, `cms.config.ts`, `cms.settings.json`, the three `cms*` scripts (only if unchanged), and the install manifest. It **never** touches what you created — your blogs, images and media (`src/content/`, `public/`), categories and tags (`cms.taxonomies.json`), media alt text (`cms.media.json`), your Astro schema, pages, and `dist/` all remain. With no install manifest present, `remove` does nothing. Both commands refuse symlinked targets and foreign-owned scripts.

## Verification

```sh
npm run cms:check # TypeScript
npm run cms:test  # filesystem round trips, YAML preservation, conflicts,
                  # concurrent saves, unsafe paths, malformed files, API origin checks,
                  # duplication, rename collisions, byte preservation, dashboard filters
npm run build    # Astro static output
```

The editor uses the official [Tiptap Simple Editor template](https://tiptap.dev/docs/ui-components/templates/simple-editor), adapted for Markdown and Karma’s editorial layout.
