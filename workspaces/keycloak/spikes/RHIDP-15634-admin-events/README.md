# RHIDP-15634 Admin Events Spike

Local spike artifacts for investigating Keycloak **Admin Events API** polling as a webhook-free alternative to the Backstage Events System PoC.

## Documents

- [ANALYSIS.md](./ANALYSIS.md) — feasibility, pros/cons, comparison, recommendation

## Code

Implementation lives in the plugin (config-gated, marked SPIKE):

- [`plugins/catalog-backend-module-keycloak/src/lib/adminEvents/`](../../plugins/catalog-backend-module-keycloak/src/lib/adminEvents/)
- Wired from [`KeycloakOrgEntityProvider`](../../plugins/catalog-backend-module-keycloak/src/providers/KeycloakOrgEntityProvider.ts)

## Run tests

```bash
cd workspaces/keycloak
yarn test plugins/catalog-backend-module-keycloak/src/lib/adminEvents --coverage=false
```
