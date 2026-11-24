# Curriculum updates

- Keep course payloads and private exports in Supabase or outside this public checkout. Never bundle curriculum, learner data, credentials or test fixtures into dist/ or GitHub.
- Preserve section/question IDs, quiz content and learning revisions during formatting-only repairs. Back up data before bulk changes and use revision guards to avoid overwriting concurrent edits.
- Preserve tables, complete multiline formula source and paired chart labels/values. Never flatten interactive components or SVGs into bare text. Retain structured chart data when importing a chart; do not invent missing values.
- Replace all generation placeholders with registered, tested tools before publication. Existing static examples must be identified as snapshots rather than promised as live controls.
- Use the shared renderer and admin preview. Saving an unchanged rich body must preserve tables and formula source.
- Before publishing: npm ci; npm test; run npm run audit:courses -- <private-export.json> against the full current curriculum. Any placeholder, malformed table, unrendered formula or unexplained text loss blocks publication.
- Verify representative tables, a multiline formula and calculator input/error behavior in the browser, and check narrow layouts. Verify the deployed commit and database state after publishing. Retain a rollback snapshot.
