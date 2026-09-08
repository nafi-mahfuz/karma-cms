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

`src/content.config.ts` defines the blog collection using Astro's glob loader. Files live in `src/content/blog/**/*.md` and work with or without Karma CMS.

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

The body is standard Markdown. Published articles (`draft: false`) appear on the home page and `/blog/<id>/`. Drafts are excluded from both development site routes and production output. Publishing changes the file; rebuild the website to update deployed output. No deployment happens through the CMS.

The public site is a small journal example. Its collection, schema, pages, and content live entirely in `src/`, with no CMS imports. See [Astro content collections](https://docs.astro.build/en/guides/content-collections/) for the underlying format.

## Local editor

- Search, filter by draft/published, and sort articles.
- Create, read, edit, and delete Markdown articles.
- Edit title, description, date, tags, and publication status.
- Tiptap visual editor: headings, bold, italic, lists, links, images by URL, quotes, code blocks, undo/redo.
- Markdown source mode opens by default to preserve arbitrary Markdown. Choosing visual mode on existing content asks before conversion: complex syntax can be normalized after visual edits. Use source mode for raw HTML, custom directives, footnotes, or other unsupported syntax.
- Extra frontmatter fields and YAML comments are preserved. Untouched documents retain their exact content. Additional fields are edited through your code editor in v1.
- Save is explicit, with unsaved-change prompts. Reload from disk reads external changes. Refresh the library to discover external additions/deletions. There is no autosave or automatic file-list watcher.
- Conflicting revisions are rejected on saves and deletes. Writes use a temporary sibling file and atomic rename; competing CMS operations are serialized. A separate external writer should not modify the same file during the final rename window.
- Deletion is permanent after confirmation; use version control for recovery.
- Malformed articles are reported separately, without hiding valid articles.

`cms.config.ts` controls repository-relative `contentDir` and `mediaDir` paths plus the website link. Defaults are `src/content/blog` and `public/media`. Both directories must exist and be readable/writable; startup reports missing directories, file paths, symlinks, or paths outside the repository with an actionable error. The media path is configuration only in Milestone 1; uploads and a media browser are not included. The CMS assumes the field names above; if you change Astro's schema, adapt the CMS field mapping and validation accordingly. Existing nested Markdown files are supported when path segments contain letters, numbers, underscores, and hyphens. New articles are created at the collection root; renaming is done in your code editor. MDX, uploads, scheduling, databases, authentication, cloud integrations, and schema discovery are outside v1.

## Separation and local access

```
src/content.config.ts       Astro-owned schema
src/content/blog/           Portable Markdown content
src/pages/                 Public Astro routes
cms.config.ts              CMS-only configuration
tools/cms/
  client/                  React UI + CSS
  editor/                  Tiptap editor
  server/                  Hono API + Vite middleware + filesystem store
  lib/                     CMS types
  tests/                   Filesystem and API tests
  package.json             Separate dependency manifest and lockfile
```

The CMS binds only to `127.0.0.1:4000`. Host and Origin checks reject foreign web pages and DNS rebinding; mutations require a JSON request and custom header. No authentication service is used. Paths and symlinks are checked, and API bodies are limited to 2 MB. Vite serves only the local CMS source area. Do not expose this development server through a public proxy or tunnel.

`npm run build` invokes only Astro. CMS UI, server, API, React and Tiptap dependencies are outside the Astro source/build graph. To remove Karma CMS, delete `tools/cms/` and `cms.config.ts`, then optionally remove the three `cms*` scripts from root `package.json`. The Astro application and blog content continue to work unchanged. The production install does not need the nested CMS dependencies.

## Verification

```sh
npm run cms:check # TypeScript
npm run cms:test  # filesystem round trips, YAML preservation, conflicts,
                  # concurrent saves, unsafe paths, malformed files, API origin checks
npm run build    # Astro static output
```
