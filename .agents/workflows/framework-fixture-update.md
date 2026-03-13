---
description: How to safely update framework requirement catalogs via fixture upsert
---
// turbo-all

## Applying Fixture Updates Safely

### 1. Prepare fixture JSON
Create/edit a JSON file with the new requirements array:
```json
{
  "requirements": [
    { "code": "A.5.1", "title": "Info security policies", "section": "Organizational Controls" },
    { "code": "A.5.2", "title": "Review of policies", "section": "Organizational Controls" }
  ],
  "deprecateMissing": false
}
```
- **`deprecateMissing: true`** → requirements NOT in the fixture get `deprecatedAt` set (soft delete)
- **`deprecateMissing: false`** → only adds/updates, never deprecates

### 2. Apply the fixture via API
```bash
curl -X POST "http://localhost:3000/api/t/{tenantSlug}/frameworks/{frameworkKey}?action=upsert-requirements" \
  -H "Content-Type: application/json" \
  -d @fixture.json
```
Response: `{ frameworkKey, created, updated, deprecated }`

### 3. Verify with diff
Compare the updated framework to another version:
```
GET /api/t/{slug}/frameworks/{key}?action=diff&from={otherKey}
```
Or visit: `/t/{slug}/frameworks/{key}/diff?from={otherKey}`

### 4. Generate readiness report
```
GET /api/t/{slug}/frameworks/{key}?action=readiness
GET /api/t/{slug}/frameworks/{key}?action=readiness&format=csv
```

### Key Safety Properties
- **Idempotent**: Running the same fixture twice creates 0 new rows
- **Non-destructive**: `deprecateMissing: false` never removes anything
- **Unique by (frameworkId, code)**: Duplicate codes in a single batch are rejected
- **Soft delete only**: deprecated requirements keep all relational data intact
- **Migration-safe**: uses `@@unique([frameworkId, code])` not primary IDs
