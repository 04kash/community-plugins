# Guide for Migrating Plugins from janus-idp/backstage-plugins to backstage/community-plugins

This guide will show you how to migrate plugins from `janus-idp/backstage-plugins` to `backstage/community-plugins` using the cli.

## Prerequisites

- Have a `janus-idp/backstage-plugins` fork locally cloned
- Have a `backstage/community-plugins` fork locally cloned

## Steps

1. In both repositories, create a new branch:

   - For `janus-idp/backstage-plugins`:

     ```bash
     git checkout -b "deprecate-workspace-name"
     ```

   - For `backstage/community-plugins`:
     ```bash
     git checkout -b "migrate-workspace-name"
     ```

2. Update the community-cli to include the `janus-plugin migrate` command. In the `backstage/community-plugins` repository, add the [`janus-migration.ts`](https://github.com/04kash/community-plugins/blob/janus-migration-script/workspaces/repo-tools/packages/cli/src/commands/plugin/janus-migration.ts) file into the following directory: `workspaces/repo-tools/packages/cli/src/commands/plugin`
   Additionally, copy the [`index.ts`](https://github.com/04kash/community-plugins/blob/janus-migration-script/workspaces/repo-tools/packages/cli/src/commands/index.ts/#L50-#L64) file into: `workspaces/repo-tools/packages/cli/src/commands/index.ts`

3. In the `backstage/community-plugins` repository, execute the janus-plugin migrate command.- Usage:`yarn community-cli janus-plugin migrate --monorepo-path [path_to_backstage_plugins]--workspace-name [workspace_name] --branch [branch_name] --maintainers [maintainer1],[maintainer2],[maintainer3],...`

   - The `path_to_backstage_plugins` is the path to the `backstage-plugins` project where the plugin(s) you want to migrate live.
   - The `workspace-name` is the name of the workspace you wish to create in the `community-plugins` project. All plugins in the `backstage-plugins` that either are exactly or start with `@janus-idp/backstage-plugin-[workspace_name]` will be migrated to this new workspace.
   - The `branch_name` is the name of the branch in the `backstage-plugins` project where the changes to add a deprecate note for the migrated plugins will be made.
   - The `maintainers` array of arguments is the github usernames of those individuals that should be listed as the maintainers for the migrated plugins. Please separate each maintainer by a comma while supplying this value.

   - example usage:
     ```bash
      yarn community-cli janus-plugin migrate --monorepo-path ../backstage-plugins --workspace-name workspace-name --branch deprecate-workspace-name --maintainers @maintainer1,@maintainer2,@maintainer3
     ```

4. The script will generate changesets in both repositories. Be sure to commit these changes and open pull requests.

> [!IMPORTANT]
> This script updates metadata commonly found across all plugins. Please review your migrated plugins to ensure that all references to "janus" have been updated to point to "community-plugins."
> Also make sure that you don't accidentally commit the `workspaces/repo-tools/packages/cli/src/commands/plugin/janus-migration.ts` or `workspaces/repo-tools/packages/cli/src/commands/index.ts` files.

5. If you run into CI issues in `community-plugins` take a look at [this github gist](https://gist.github.com/Fortune-Ndlovu/1562789f3905b4fe818b9079a3032982) which outlines the process taken to migrate argocd plugins in great detail.

6. Check if the migrated plugins need to be added to janus-idp/backstage-showcase. If they do, create a wrapper for them following the steps below:

- In `dynamic-plugins> wrappers` create a directory, name it based on your plugin (eg: `backstage-community-plugin-3scale-backend`)
- Create a `src` directory within it
- Add a `index.ts` file to this src directory and export from the plugin package here. Eg: `export * from '@backstage-community/plugin-3scale-backend';`
- In `dynamic-plugins> wrappers > backstage-community-plugin-3scale-backend` (or whatever you named your wrapper directory), add a `package.json` file. Add your plugin package in dependencies.
  - [Frontend plugin `package.json` example](https://github.com/janus-idp/backstage-showcase/blob/main/dynamic-plugins/wrappers/backstage-community-plugin-redhat-argocd/package.json)
  - [Backend plugin `package.json` example](https://github.com/janus-idp/backstage-showcase/blob/main/dynamic-plugins/wrappers/backstage-community-plugin-3scale-backend/package.json)
- run `yarn export-dynamic` to generate dist-dynamic directory
