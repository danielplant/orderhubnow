# Future Enhancement Ideas

Backlog of potential improvements to revisit once core functionality is stable.

## Status Legend
- 🔵 **Idea** - Not yet planned
- 🟡 **Planned** - Approved for implementation
- 🟢 **In Progress** - Currently being worked on
- ✅ **Done** - Completed

## Reference Documents

| Document | Description |
|----------|-------------|
| [credentials-and-access.md](./credentials-and-access.md) | All login credentials, EC2 access, database info |
| [build-deploy-pipeline.md](./build-deploy-pipeline.md) | CI/CD improvements, deploy automation options |

## Backlog

### Needs Investigation
| Item | Status | Effort | Priority | File |
|------|--------|--------|----------|------|
| Old order SKU compatibility | 🔵 Investigate | 1-2 hrs | **High** | [old-order-sku-compatibility.md](./old-order-sku-compatibility.md) |
| PDF download showing blank | 🔵 Investigate | 1-3 hrs | Medium | [pdf-blank-issue.md](./pdf-blank-issue.md) |
| Wrong product titles/images | 🔵 Investigate | 15 min - 2 hrs | Medium | [wrong-titles-images.md](./wrong-titles-images.md) |
| PreOrder showing only 3 sizes | 🔵 Investigate | 30-60 min | Low | [preorder-missing-sizes.md](./preorder-missing-sizes.md) |

### Enhancements
| Item | Status | Effort | Priority | File |
|------|--------|--------|----------|------|
| Automated deploy pipeline | 🔵 Idea | 2-4 hrs | High | [build-deploy-pipeline.md](./build-deploy-pipeline.md) |
| Middleware → Proxy migration | 🔵 Idea | 30 mins | Low | [build-deploy-pipeline.md](./build-deploy-pipeline.md) |
| Real-time inventory sync via webhooks | 🔵 Idea | 2-4 hrs | Medium | [real-time-sync.md](./real-time-sync.md) |
| Lightbox accessibility improvements | 🔵 Idea | 30 mins | Low | [lightbox-accessibility.md](./lightbox-accessibility.md) |
| Color swatch fallback from SKU suffix | 🔵 Idea | 45 mins | Low | [color-from-sku-fallback.md](./color-from-sku-fallback.md) |
| Fabric type visual indicator | 🔵 Idea | 1-2 hrs | Low | [fabric-type-indicator.md](./fabric-type-indicator.md) |

### Code Cleanup
| Item | Status | Effort | Priority | Notes |
|------|--------|--------|----------|-------|
| Remove ShopifyStatusCard polling code | 🔵 Idea | 15 mins | Low | Leftover from old webhook-based flow. The component still has `startPolling`, `pollIntervalRef`, `setInterval` that's no longer needed since sync is now synchronous. Kept as fallback for `status.syncInProgress` on page load, but could be removed since: (1) new syncs wait for completion, (2) if someone refreshes during a sync, they just see "in progress" and can wait. |

## Adding New Ideas

Create a new markdown file in this folder with:
- Problem/opportunity description
- Proposed solution
- Implementation steps
- Effort estimate
- Any research/references

Then add a row to the table above.
