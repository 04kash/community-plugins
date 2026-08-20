# RHIDP-15634 — Admin Events API Spike Analysis

**Status:** Local spike only (not published to Jira/GitHub)  
**Date:** 2026-08-20  
**Workspace:** `workspaces/keycloak`  
**Branch:** `spike/RHIDP-15634-admin-events-api`

## Summary

Polling Keycloak's Admin Events REST API can drive user/group/membership catalog deltas without Keycloak webhooks. This unblocks near-real-time sync while the Events System push path remains blocked on RHBK webhook support.

Prefer a hybrid model: Admin Events poll for frequent deltas, infrequent full sync as a safety net. Treat incremental entity provider work as a parallel longer-term option if Admin Events operational constraints (event store, retention, permissions) are unacceptable.

---

## 1. Feasibility checklist

| Check                       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Endpoint                    | `GET /admin/realms/{realm}/admin-events`. Supported in `@keycloak/keycloak-admin-client` via `realms.findAdminEvents` (verified on client 26.6.3, already used by the plugin).                                                                                                                                                                                                                                                       |
| Filters                     | `operationTypes`, `resourceTypes`, `resourcePath`, `dateFrom`/`dateTo`, `first`/`max`. Sufficient for watermarking.                                                                                                                                                                                                                                                                                                                  |
| Org-relevant resource types | `USER`, `GROUP`, `GROUP_MEMBERSHIP` cover create/update/delete and membership changes. Nested groups appear as `groups/{parent}/children/{id}` paths.                                                                                                                                                                                                                                                                                |
| Realm prerequisites         | Realm must have admin events enabled (`adminEventsEnabled`) and typically "Include representation" if payload inspection is needed. Events must be stored (event store / expiration configured).                                                                                                                                                                                                                                     |
| Permissions                 | Caller needs realm-management roles that include viewing events (commonly `view-events`). The service account used today for user/group scrape may need an extra role.                                                                                                                                                                                                                                                               |
| User events gap             | Self-registration, account console profile edits, and other user events are not admin events. Those changes are invisible to this poller until full sync runs.                                                                                                                                                                                                                                                                       |
| LDAP/federation sync gap    | LDAP federation sync does not emit per-user/group admin events. Only one bulk `USER_FEDERATION_PROVIDER` + `ACTION` event fires. Individual creates/updates are invisible. Workaround: custom `LDAPStorageMapper` SPI plugin with `onImportUserFromLDAP` hook ([reference](https://medium.com/@ivancheahkf/keycloak-event-listener-spi-for-ldap-user-federation-sync-62fa17c573bc)). Without that, full sync is the only reconciler. |
| Partial import gap          | `POST .../partialImport` emits a single `REALM` + `CREATE` event with the entire import blob in `representation`, not individual `USER`/`GROUP` events. Addressable by parsing the representation payload. Low priority (infrequent admin operation).                                                                                                                                                                                |
| Cursor / retention          | Watermark by event `time` works. If retention is shorter than poll interval, or the store is cleared, events are lost and full sync must reconcile. PoC watermark is in-memory only (lost on restart).                                                                                                                                                                                                                               |
| Pagination                  | API pages with `first`/`max` (default max 100). PoC reads one page per tick. Production must loop until caught up.                                                                                                                                                                                                                                                                                                                   |
| RHBK support                | Admin Events API is standard Keycloak Admin REST, exposed by RHBK. Customer enablement of admin event storage is a config requirement, not a missing API. Confirm with RHBK docs that enabling admin events + required roles is supported in the target deployment model.                                                                                                                                                            |

### Keycloak ingestion paths — event visibility matrix

| Ingestion method                                                        | Emits per-entity admin events?                                 | Visible to poller? |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| Admin Console / Admin REST API / CLI / Client libs                      | Yes (`USER`/`GROUP` CREATE/UPDATE/DELETE)                      | Yes                |
| Terraform / Pulumi providers (wrap Admin API)                           | Yes                                                            | Yes                |
| SCIM Realm API (KC 26.6+, experimental)                                 | Likely yes (shares Admin API model) — needs verification       | Probably yes       |
| External SCIM bridge (e.g. `scim-for-keycloak`, pre-26.6)               | Usually yes (proxies Admin REST)                               | Usually yes        |
| Self-registration (login flow)                                          | No — User Event (`REGISTER`)                                   | No                 |
| IdP first-login / JIT provisioning                                      | No — User Event or internal                                    | No                 |
| LDAP/AD federation sync (`triggerFullSync` / `triggerChangedUsersSync`) | No — one bulk `USER_FEDERATION_PROVIDER` + `ACTION` event only | No                 |
| Kerberos federation                                                     | No                                                             | No                 |
| Custom User Storage SPI                                                 | No (bypasses Admin API)                                        | No                 |
| Partial import (`POST .../partialImport`)                               | One `REALM` + `CREATE` event (blob)                            | No (addressable)   |
| Full realm import (`--import-realm` at boot)                            | No events (pre-boot)                                           | No                 |

**Workarounds for uncovered paths:**

- LDAP sync: Custom `LDAPStorageMapper` SPI plugin overriding `onImportUserFromLDAP` can emit admin events per user. Without it, full sync reconciles.
- Partial import: Parse the `representation` JSON from `admin.REALM-CREATE` for embedded users/groups. Low priority.
- Self-registration / JIT: Poll Keycloak User Events API (`GET .../events`) for `REGISTER` type, or rely on full sync.

**Enterprise deployment implication:** If the customer's source of truth is LDAP/AD with periodic sync into Keycloak, admin events alone miss the bulk of changes. If users are managed directly in Keycloak (Admin Console/API/SCIM/Terraform), admin events cover nearly everything. Tune full sync frequency based on how the customer populates Keycloak.

### Event priority by adopter impact

| Priority | Scenario                                                | Admin Events impact                                                                  |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P1       | First login fails — user not yet in catalog             | Solved for Admin API path — USER CREATE delta populates catalog within poll interval |
| P1       | Users/groups missing after LDAP federation sync         | Not solved — LDAP sync bypasses Admin Events. Full sync required.                    |
| P2       | Username normalization failures (emails, special chars) | Indirect — faster re-ingestion after fix. Root cause is transformer logic.           |
| P2       | Stale catalog after group rename/move                   | Solved — GROUP UPDATE/move handler refreshes group + parents + members               |
| P2       | Provider role/permissions misconfiguration              | Not solved. Documentation gap.                                                       |
| P3       | Catalog users lag Keycloak                              | Faster delta sync reduces lag window                                                 |
| P3       | UI page load times increased (large catalog)            | Indirect — reduced full-sync API churn                                               |

The top pain is "user exists in Keycloak but not in catalog at login time." Admin Events polling addresses this for Admin Console/API user creation by cutting sync lag from hours to ~1 min. The equally common LDAP-federation gap reinforces the need for the hybrid approach.

**Events ordered by customer impact:**

1. USER CREATE — user in catalog before first login
2. GROUP_MEMBERSHIP UPDATE — group changes reflect immediately
3. GROUP CREATE/DELETE — org structure changes
4. GROUP UPDATE (rename/move) — no stale entities after restructuring
5. USER UPDATE — profile changes propagate
6. USER DELETE — offboarded users removed promptly

### Verdict

Feasible if adopters enable admin event storage, grant `view-events`, and accept periodic full sync for gaps (user events, LDAP federation, partial imports, retention, restarts without persisted watermark).

---

## 2. Comparison to existing approaches

### A. Events System PoC — [04kash/backstage#1](https://github.com/04kash/backstage/pull/1)

|                 | Events System PoC (push)                                      | Admin Events poll (this spike)              |
| --------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Transport       | Keycloak HTTP ingress to Backstage `EventsService`            | Backstage polls Keycloak `findAdminEvents`  |
| RHBK dependency | Blocked until Keycloak/RHBK emits webhooks                    | None for ingress. Uses existing Admin REST. |
| Latency         | Near real-time (push)                                         | Poll interval (e.g. 1 min)                  |
| Extra packages  | `events-backend-module-keycloak` + provider subscribe         | No events module. Provider-local poller.    |
| Delta handlers  | Full user/group/membership handlers + CatalogApi              | Simplified deltas + in-memory entity index  |
| Shared idea     | Both apply `applyMutation({ type: 'delta' })` for org changes |                                             |

The push PoC's delta-handler design is reusable. This spike did not port the events router/module.

### B. Sibling spike — incremental ingestion

Incremental entity provider framework targets framework-level ingestion (burst/delta APIs, provider state). A larger investment that may handle large realms long-term but does not uniquely require Keycloak Admin Events. Admin Events can feed either a custom EntityProvider (this PoC) or an incremental provider.

|                       | Admin Events poll               | Incremental ingestion                  |
| --------------------- | ------------------------------- | -------------------------------------- |
| Scope                 | Keycloak-specific event source  | Backstage framework pattern            |
| Effort to first value | Low-medium (this PoC)           | Higher (framework wiring, state store) |
| Keycloak coupling     | Tight to admin-events semantics | Can use various delta sources          |
| Completeness          | Needs full sync safety net      | Still needs reconcile/burst            |

---

## 3. Pros / cons / impact

### Pros

- Unblocks delta sync without waiting for RHBK webhooks
- Far fewer Keycloak API calls than full realm scrape each tick
- Reuses the delta-mutation approach proven in the Events PoC
- Admin client already present. No new SDK dependency.
- Coexists with rare full sync for correctness

### Cons

- Polling lag and catch-up complexity under bursty admin activity
- Requires admin events enabled + retention tuning (ops burden)
- Misses user events (self-service profile/registration)
- Needs durable watermark + pagination for production
- In-memory entity index does not survive replicas/restarts (needs CatalogApi or DB)
- Membership/group-move edge cases need QE. Spike now has CatalogService cascade DELETE + GROUP UPDATE rename/move handlers.

### Impact (expected)

- **Sync time:** Steady-state ingest uses event page + per-event `users.findOne`/`groups.findOne` instead of full user/group listing
- **API load:** Large reduction vs frequent full sync. Spikes if many events accumulate.
- **Ops:** New realm config (admin events on) and RBAC. Document in RHDH install guides.
- **Overlap:** Complements incremental-ingestion investigation. Does not replace smarter full sync or incremental provider work.

---

## 4. Recommendation

1. Pursue Admin Events polling (hybrid with infrequent full sync) as the practical path while webhooks remain unavailable.
2. Keep the Events System design as the preferred push architecture when RHBK gains webhook support. Delta handlers can be shared.
3. Continue incremental-ingestion investigation for large-scale realms. Do not block Admin Events on it.
4. Productize only after: persisted watermark, multi-page poll, CatalogApi-backed deletes, metrics, docs for enabling admin events on RHBK, and QE matrix.

### Rough productization effort

| Work                                         | Size                    |
| -------------------------------------------- | ----------------------- |
| Harden poller (pagination, backoff, metrics) | S-M                     |
| Persist watermark + CatalogApi deltas        | M                       |
| Config/docs/RBAC guidance                    | S                       |
| Tests + QE against RHBK                      | M                       |
| **Total**                                    | ~M (order-of-magnitude) |

---

## 5. Local PoC

Config-gated spike in `@backstage-community/plugin-catalog-backend-module-keycloak`:

- `src/lib/adminEvents/*` — fetch, map, delta apply
- Provider schedules `:admin-events` when `adminEvents.enabled: true`
- Primary `schedule` still runs full sync (safety net)
- In-memory watermark + entity index
- Unit tests for mapping, fetch watermark, and config parsing

### Enable locally

```yaml
catalog:
  providers:
    keycloakOrg:
      default:
        baseUrl: http://localhost:8080
        realm: backstage-community-realm
        # Keep full sync infrequent when relying on admin events
        schedule:
          frequency: { hours: 24 }
          timeout: { minutes: 10 }
        adminEvents:
          enabled: true
          maxResults: 100
          schedule:
            frequency: { minutes: 1 }
            timeout: { minutes: 1 }
```

### Manual test matrix (against local Keycloak)

Prereq: Realm settings > Events > Enable admin events (and set expiration).

| Action in Keycloak                 | Expected                                                             |
| ---------------------------------- | -------------------------------------------------------------------- |
| Create user                        | User entity appears via delta (after poll)                           |
| Update user                        | User entity updated                                                  |
| Delete user                        | User entity removed (if indexed)                                     |
| Create group                       | Group entity appears                                                 |
| Delete group                       | Group entity removed (if indexed)                                    |
| Add/remove user from group         | User + group refreshed                                               |
| Disable admin events / clear store | Next full sync reconciles                                            |
| Restart backend                    | Watermark reset. First empty poll sets cursor to now. Run full sync. |

### Non-goals

- No Jira comment / GitHub PR publish from this spike
- No `events-backend-module-keycloak` port
- No deep incremental-provider implementation

## Local test environment (2026-08-20)

Verified end-to-end on this machine:

| Piece            | Detail                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keycloak         | `quay.io/keycloak/keycloak:26.0.8` as compose service `keycloak-admin-events` (RHBK image not used — no `registry.redhat.io` login). Admin Events API is the same surface RHBK exposes. |
| Realm            | Spike import with `adminEventsEnabled=true` + `view-events` on `service-account-backstage`                                                                                              |
| rhdh-local-setup | `/home/kmittal/rhdh-local-setup` (`RHDH_LOCAL_SETUP_DIR`)                                                                                                                               |
| Plugin           | Exported spike to `rhdh-local/local-plugins/backstage-community-plugin-catalog-backend-module-keycloak-dynamic`                                                                         |
| Config           | `adminEvents.enabled: true`, poll every 30s. Full sync every 30m.                                                                                                                       |

### Test evidence

1. Provider registered `KeycloakOrgEntityProvider:default:admin-events` (PT30S)
2. Polls succeed: `Admin events poll: 0 raw event(s), …`
3. Created user `admin-events-spike-user` via Admin API. Admin event `USER CREATE` emitted.
4. Next poll: `Admin events poll: 1 raw event(s), 1 org-relevant event(s)` then `Applied admin event USER CREATE for 2cc40ae1-…`
5. Subsequent poll skipped already-seen event via watermark (`1 raw / 0 org-relevant`)

### Nested subgroups (verified)

Keycloak emits nested creates as `GROUP` + `CREATE` with `resourcePath=groups/{parentId}/children` and the child id in `representation` (not in the path). Deletes use the flat path `groups/{groupId}` (same as top-level).

| Action                     | Keycloak event shape                | Spike result                           | Notes                                                                      |
| -------------------------- | ----------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Create top-level group     | `groups/{id}`                       | Applied                                |                                                                            |
| Create child / grandchild  | `groups/{parent}/children` + rep.id | Applied (3 levels)                     | Mapper reads id from representation. Must not treat `children` as groupId. |
| Update nested group        | `groups/{id}` UPDATE                | Applied when group exists at poll time |                                                                            |
| Delete nested group        | `groups/{id}` DELETE                | Applied if entity was indexed          |                                                                            |
| Membership on nested group | `users/{u}/groups/{g}`              | Applied                                |                                                                            |

**Verified (3-level CREATE in one poll):**

```
Applied admin event GROUP CREATE for {parent}
Applied admin event GROUP CREATE for {child} (parent {parent})
Applied admin event GROUP CREATE for {grandchild} (parent {child})
```

**Same-poll create-then-delete race:** If CREATE and DELETE for a nested group both land before the next poll, `groups.findOne` on CREATE returns empty (entity already gone). Silent skip. DELETE also skips (never indexed). Full sync reconciles. This is a general poller limitation.

### Comparison: push Events PoC ([04kash/backstage#1](https://github.com/04kash/backstage/pull/1))

| Concern                 | Push PoC (`handleGroupCreate`)                                                                                            | Admin Events spike                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Nested CREATE detection | `resourcePath.split('/').length === 3` for subgroup. Child id from `JSON.parse(representation).id`.                       | Same: path `groups/{parent}/children`. Child id from representation. Also handles `.../children/{id}`.      |
| Parent linkage          | Re-fetches parent + child. Uses `createGroupEntities` / `processGroupsRecursively` + CatalogApi to replace parent entity. | Sets `group.parent` from in-memory index by `parentGroupId`. Refreshes parent via `findOne` + `parseGroup`. |
| Entity lookup           | CatalogApi filters by Keycloak id annotation                                                                              | In-memory `entityIndex` (populated on full sync)                                                            |
| Nested DELETE           | Removes group and catalog subgroups + refreshes parent + memberships via CatalogApi                                       | Same pattern: CatalogService cascade delete + parent/member refresh (falls back to entity index)            |
| GROUP-UPDATE / move     | Explicit TODO (rename + reparent)                                                                                         | Implemented: refresh group + old/new parents + subgroups + members                                          |
| Timing                  | Push applies while resource usually still exists                                                                          | Poll can see CREATE after DELETE already happened (race)                                                    |

Nested create semantics match the push PoC (`representation.id` under `groups/{parent}/children`). The Admin Events spike also reuses the PoC's CatalogService cascade DELETE and GROUP UPDATE rename/move refresh set. Remaining productization gaps: persisted watermark, multi-page poll, hardening against create-then-delete races within one poll interval.

### Gotchas found during test

- `resourceTypes=USER,GROUP,…` (comma-separated) returns Keycloak HTTP 500. Must use repeated query params (arrays).
- `dateFrom` as epoch millis returns 400. Use ISO-8601.
- Nested CREATE path is `groups/{parent}/children`. Child id is in representation, not the path. Early mapper bug treated parent as groupId.
- Compose should wait for Keycloak healthy before RHDH first poll.
- Re-running `install-dynamic-plugins` alone can remove the keycloak plugin. Prefer full `rhdh-local up`.
- Create+delete inside one poll interval drops nested CREATEs (`findOne` already 404).

### How to re-run

```bash
export RHDH_LOCAL_SETUP_DIR=/home/kmittal/rhdh-local-setup
uv run /home/kmittal/.claude/skills/rhdh-local/scripts/rhdh-local apply
uv run /home/kmittal/.claude/skills/rhdh-local/scripts/rhdh-local up --customized --lightspeed
# UI: http://localhost:7007  Keycloak: http://localhost:8080 (admin/admin)
```
