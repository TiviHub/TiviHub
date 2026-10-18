# UX Issue Register

Use this register during the audit and implementation. Add evidence before assigning high confidence.

| ID | Area | Problem or hypothesis | Evidence | Confidence | Impact | Test or next action | Status |
|---|---|---|---|---|---|---|---|
| UX-001 | First launch | The no-source experience may prioritize visual treatment over the Add source task. | Repository review | Medium | High | Test first-launch task completion | Open |
| UX-002 | Source setup | Multiple source types and advanced fields may make the dialog difficult to scan. | Repository review | High | High | Test M3U and Xtream setup with new users | Open |
| UX-003 | Source setup | Technical validation and provider errors may not always explain the next action. | Repository review | Medium | High | Catalog error messages and test recovery | Open |
| UX-004 | Navigation | Users may not always understand the relationship between active source and current section. | Hypothesis | Low | Medium | Test source switching and browsing | Open |
| UX-005 | Cards | Card activation may be ambiguous where playback and details are both possible. | Repository review | Medium | High | Test Watch, Resume, and Details expectations | Open |
| UX-006 | Library | Favorites, watchlist, watching, watched, and history may be difficult to distinguish. | Repository review | Medium | Medium | Test library categorization | Open |
| UX-007 | Playback | Failure states may need more actionable recovery options. | Repository review | Medium | High | Test network, DRM, and unsupported-stream failures | Open |
| UX-008 | Accessibility | Focus may be visible in some contexts but needs systematic verification across themes and overlays. | Repository review | Medium | High | Keyboard and screen-reader audit | Open |
| UX-009 | TV setup | Remote text entry may make long URLs and credentials impractical. | Titan OS risk | High | High | Test platform keyboard on target devices | Open |
| UX-010 | TV storage | Desktop catalog and source-document storage assumptions may not fit TV browser limits. | Titan OS risk | High | High | Measure data and verify storage APIs | Open |
| UX-011 | TV performance | Large shelves, artwork, and effects may cause remote-input lag on lower-spec devices. | Titan OS documentation/risk | High | High | Profile a representative low-end device | Open |
| UX-012 | TV navigation | Desktop focus and Back behavior cannot be assumed to transfer directly. | Titan OS risk | High | High | Create focus maps and test DevView | Open |

## Status values

- Open
- Validated
- Accepted
- Implemented
- Rejected
- Deferred

## Confidence values

- Low: assumption or early hypothesis
- Medium: supported by repository review or limited evidence
- High: reproduced in testing or confirmed by authoritative platform documentation
