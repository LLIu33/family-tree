Status: fixed the critical multi-spouse child-linking bug and the important `PersonPanel` duplicate-submit UX issue.
Scope: `addChild` now uses a sole-parent family when the selected parent has zero or multiple spouses, keeps shared-family linking only for the exactly-one-spouse case, and resets/collapses the add-child form after success in both UI branches.
Verification:
- `npm test -- --testPathPattern=family-tree.service.spec` — passed
- `npm run lint` — passed
- `npm run build` — passed
- `cd web && npx tsc --noEmit` — passed
Notes:
- Added `addChild` unit coverage proving zero/many spouses use `linkSoleParentChild` and the one-spouse path still uses `linkParentChild`.
- `linkSoleParentChild(treeId, parentId, childId)` scopes all family creation/link queries to `treeId` and never reuses an existing spouse family.
