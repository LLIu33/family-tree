# Tree sharing — invites, roles, JWT switch

**Date:** 2026-08-16  
**Status:** Approved for planning  
**Roadmap:** Now → «Шаринг дерева — invite, read-only и/или соредактор»

## Problem

The product is locked to **1 user → 1 tree** via `(:User)-[:OWNS]->(:Tree)` and auth that always resolves `OWNS … LIMIT 1`. There is no way to invite family members as viewers or co-editors. ROADMAP lists sharing as a Now item.

## Goals

- Owner can create **invite links** (copyable URL; no email send in MVP).
- Guests join after login/register via invite token as **viewer** or **editor**.
- Users with access to multiple trees can **switch active tree** (new JWT with `treeId` + `role`).
- Existing `/family-tree/*` APIs keep using JWT `treeId`, with role checks for read vs write.
- Register still creates a personal owned tree.

## Non-goals

- Email delivery of invites.
- Public anonymous read-only links (no account).
- Multiple owned trees per user (creating extra trees beyond register).
- Tree deletion / ownership transfer.
- SSO / 2FA (Later).

## Design

### 1. Graph model

**Keep**
- `(:User)-[:OWNS]->(:Tree)` — owner; created at register.

**Add**
- `(:User)-[:MEMBER_OF { role: 'viewer' | 'editor', joinedAt: datetime }]->(:Tree)`
- `(:Invite { id, tokenHash, role, expiresAt, createdAt, revokedAt? })-[:FOR_TREE]->(:Tree)`
- `(:Invite)-[:CREATED_BY]->(:User)`

Store only a **hash** of the invite token (plaintext shown once in create response / URL).

**Effective role** for `(userId, treeId)`:
1. `owner` if `OWNS`
2. else `MEMBER_OF.role` if present
3. else no access

### 2. Permissions

| Action | viewer | editor | owner |
|--------|--------|--------|-------|
| Read graph / individuals / visualize | ✓ | ✓ | ✓ |
| GEDCOM export | ✓ | ✓ | ✓ |
| Create/update people, relationships, import, media | | ✓ | ✓ |
| Create/revoke invites, list/kick members | | | ✓ |

### 3. Auth / JWT

- JWT payload: `{ sub, email, treeId, role }` where `role` is the effective role in that tree.
- On validate / `/auth/me`: verify the user still has access to token `treeId`; do **not** blindly use `OWNS LIMIT 1`.
- If token `treeId` is no longer accessible: fall back to the user’s owned tree if any; else 401.
- Login / register: issue JWT for the owned tree (`role: owner`), same as today for new users.

### 4. API

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/trees` | JWT | List accessible trees `{ id, name, role }[]` (`Tree.name` from register; role = effective) |
| `POST` | `/trees/:treeId/switch` | JWT + access | Return new tokens/user with that `treeId` + `role` |
| `POST` | `/trees/:treeId/invites` | owner | Body `{ role, expiresInDays? }` → `{ id, inviteUrl, role, expiresAt }` (raw token only here) |
| `GET` | `/trees/:treeId/invites` | owner | Active invites without secrets |
| `DELETE` | `/trees/:treeId/invites/:inviteId` | owner | Revoke |
| `GET` | `/trees/:treeId/members` | owner (MVP) | Owner + members |
| `DELETE` | `/trees/:treeId/members/:userId` | owner | Remove `MEMBER_OF` (cannot remove owner) |
| `POST` | `/invites/:token/accept` | JWT | Validate invite → create `MEMBER_OF` → return switched JWT (or 409 if already member) |

**Existing `/family-tree/*`**
- Unchanged paths; continue to use `@CurrentUser().treeId`.
- Add `assertMinRole('viewer'|'editor'|'owner')` in services or a guard/interceptor before mutating vs reading.

**Invite accept for logged-out users:** frontend route `/invite/:token` → redirect to login/register with `returnUrl` → then `POST /invites/:token/accept`.

### 5. Web UI

- Tree switcher in nav (from `GET /trees`) calling switch and persisting new token (and `rodnik_treeId` if still used).
- Access / sharing page for owners: create invite (role select), copy link, list invites & members, revoke/kick.
- Invite accept page.
- Hide or disable write/import actions when `role === 'viewer'` (API remains source of truth).

### 6. Security

- Cryptographically random invite tokens; store SHA-256 (or bcrypt) hash.
- Default expiry (e.g. 14 days); owner can revoke.
- Accept is idempotent-ish: already member with same/higher role → succeed + switch; conflicting role policy: keep existing membership unless owner re-invites (MVP: leave existing role, still switch).
- Rate-limit accept/create later (out of scope unless trivial); do not leak whether an invite exists beyond generic 404 for bad tokens.

### 7. Testing

- Unit: role resolution (owner / editor / viewer / none).
- Invite: create → accept → MEMBER_OF; expired/revoked → 4xx; viewer write → 403.
- Switch: non-member → 403; member → JWT with correct `treeId`/`role`.
- Register still yields owned tree + owner JWT.

### 8. Docs

- Mark ROADMAP sharing checkbox when shipped.
- Spec lives at this path; plan follows after approval.

## Implementation order (high level)

1. Neo4j access helpers + role assertion; fix auth profile/JWT to validate access to `treeId`.
2. Trees list + switch endpoints.
3. Invite create/list/revoke + accept.
4. Enforce roles on family-tree read/write paths.
5. Web: switcher, access page, invite accept, viewer UI gating.
6. ROADMAP checkbox.

## Open follow-ups

- Email invite delivery.
- Anonymous public viewer links.
- Multiple owned trees / create-tree API.
- Member can leave a tree themselves.
