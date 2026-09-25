# Professional Edge Maintenance

The public page renders from `content/ai-professional-edge.md`.

## Metadata

The page supports two optional HTML comments that stay invisible to visitors.

### Whole-page review date

```md
<!-- edge-review: 2026-09-25 -->
```

Use this once near the top of the file. It updates the visible “Reviewed …” date on the page.

### Entry status

Place this immediately before an `##` or `###` heading:

```md
<!-- edge-meta: status=active; reviewed=2026-09-25 -->
### Example entry
```

Supported status values:

- `active` — shown on Professional Edge. This is also the default when no metadata is present.
- `durable` — hidden from Professional Edge because the idea now belongs in Durable Knowledge.
- `archive` — hidden from Professional Edge but preserved in source for reference.

The renderer intentionally ignores other metadata for now so maintenance stays lightweight.

## Curation rules

When doing a Professional Edge audit:

1. **Keep** material that still gives useful, current leverage for AI product, customer success, or consulting work.
2. **Condense** entries that repeat the same idea or can be expressed as one stronger principle.
3. **Move to Durable** when the value is now a lasting principle rather than a current tool, pattern, or reference.
4. **Archive** material that is obsolete, superseded, too narrow, or no longer worth visual space.
5. **Reorganize** when a section becomes harder to scan than the content is worth.
6. **Refresh sources** for time-sensitive tools, models, vendors, and architecture examples before keeping them active.

## Recommended workflow

For normal additions, edit the Markdown only.

For a periodic cleanup:

1. Review the full file, not just the newest entries.
2. Check for overlap, stale examples, overlong sections, and category drift.
3. Condense first; archive second.
4. Move durable principles into `ai-durable-knowledge.html` / its source as a separate explicit change.
5. Update `edge-review` only after the whole-page pass is complete.

Do not add an admin UI, CMS, database, or authentication unless the maintenance problem materially changes.
