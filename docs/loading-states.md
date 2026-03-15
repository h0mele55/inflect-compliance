# Loading States — Validation Guide

## Slow-Network Testing

To validate loading states look correct under poor conditions:

### 1. Chrome DevTools Throttle
1. Open DevTools → **Network** tab
2. Click the **throttle dropdown** (defaults to "No throttling")
3. Select **"Slow 3G"** or create a custom profile:
   - Download: 100 kb/s
   - Upload: 50 kb/s
   - Latency: 500 ms
4. Refresh the page — you should see the **skeleton loaders** for 2–5 seconds

### 2. What to Check
- [ ] No bare "Loading..." text visible
- [ ] Skeletons match the final layout (no layout shift)
- [ ] Table skeleton has correct number of columns
- [ ] Detail page skeleton has tabs + card structure
- [ ] Filter bar skeleton matches filter inputs

### 3. Key Routes to Test
| Route | Expected Skeleton |
|-------|------------------|
| `/t/{slug}/controls` | Header + filter bar + 8-col table |
| `/t/{slug}/policies` | Header + filter bar + 6-col table |
| `/t/{slug}/tasks` | Header + filter bar + 8-col table |
| `/t/{slug}/risks` | Header + 8-col table |
| `/t/{slug}/vendors` | Header + filter bar + 7-col table |
| `/t/{slug}/evidence` | Header + filter bar + 6-col table |
| `/t/{slug}/frameworks` | Header + 3 framework cards |
| `/t/{slug}/audits` | Header + card + 6-col table |
| `/t/{slug}/dashboard` | 4 metric cards + chart + activity |

### 4. Automated Guardrails
```bash
npx jest tests/guardrails/loading-states.test.ts
```
This test will fail if:
- Any `page.tsx` contains bare "Loading..." text (mutations like "Saving..." are allowed)
- Any key route is missing `loading.tsx`

### 5. Inline Mutation States
These are intentional and allowed:
- `⏳ Uploading...` — file upload buttons
- `⏳ Saving...` — edit modal save buttons
- `Applying...` — bulk action buttons
- `Posting...` — comment submit buttons

These show a brief inline label change, not a page-blocking loading state.
