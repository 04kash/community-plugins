# Instructions for Migrating Plugins from janus-idp/backstage-plugins to backstage/community-plugins

1. **Fork and Clone Repositories**:
   Create a fork of both the `janus-idp/backstage-plugins` and `backstage/community-plugins` repositories, then clone them to your local machine.

2. **Create New Branches**:
   In both repositories, create a new branch:

   - For `janus-idp/backstage-plugins`:
     ```bash
     git checkout -b "deprecate-workspace-name"
     ```
   - For `backstage/community-plugins`:
     ```bash
     git checkout -b "migrate-workspace-name"
     ```

3. **Copy Migration Files**:
   In the `backstage/community-plugins` repository, copy the [`janus-migration.ts`](https://github.com/04kash/community-plugins/blob/janus-migration-script/workspaces/repo-tools/packages/cli/src/commands/plugin/janus-migration.ts) file into the following directory: `workspaces/repo-tools/packages/cli/src/commands/plugin`
   Additionally, copy the [`index.ts`](https://github.com/04kash/community-plugins/blob/janus-migration-script/workspaces/repo-tools/packages/cli/src/commands/index.ts) file into: `workspaces/repo-tools/packages/cli/src/commands/index.ts`

4. **Run Migration Command**:
   In the `backstage/community-plugins` repository, execute the following command:

```bash
yarn community-cli janus-plugin migrate --monorepo-path ../backstage-plugins --workspace-name workspace-name --branch deprecate-workspace-name --maintainers @maintainer1,@maintainer2,@maintainer3
```

This will migrate all plugins starting with `workspace-name` in janus-idp/backstage-plugins to a workspace named `workspace-name` in backstage/community-plugins

It will return an error if the workspace already exists.

5. [!Disclaimer]
   This script updates metadata commonly found across all plugins. Please review your migrated plugins to ensure that all references to "janus" have been updated to point to "community-plugins."

   The script will generate changesets in both repositories. Be sure to commit these changes and open pull requests.
