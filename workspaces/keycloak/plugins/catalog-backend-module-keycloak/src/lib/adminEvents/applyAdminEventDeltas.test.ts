/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AuthService } from '@backstage/backend-plugin-api';
import type { GroupEntity, UserEntity } from '@backstage/catalog-model';
import type {
  CatalogService,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';

import { KEYCLOAK_ID_ANNOTATION } from '../constants';
import { AdminEventsDeltaApplicator } from './applyAdminEventDeltas';
import type { NormalizedAdminEvent } from './types';

function groupEntity(
  id: string,
  name: string,
  options?: {
    parentRef?: string;
    childRefs?: string[];
    memberRefs?: string[];
    children?: string[];
    members?: string[];
    parent?: string;
  },
): GroupEntity {
  const relations = [
    ...(options?.parentRef
      ? [{ type: 'childOf', targetRef: options.parentRef }]
      : []),
    ...(options?.childRefs ?? []).map(targetRef => ({
      type: 'parentOf',
      targetRef,
    })),
    ...(options?.memberRefs ?? []).map(targetRef => ({
      type: 'hasMember',
      targetRef,
    })),
  ];
  return {
    apiVersion: 'backstage.io/v1beta1',
    kind: 'Group',
    metadata: {
      name,
      namespace: 'default',
      annotations: { [KEYCLOAK_ID_ANNOTATION]: id },
    },
    spec: {
      type: 'group',
      children: options?.children ?? [],
      members: options?.members ?? [],
      parent: options?.parent,
    },
    relations,
  };
}

function userEntity(
  id: string,
  name: string,
  memberOf: string[] = [],
): UserEntity {
  return {
    apiVersion: 'backstage.io/v1beta1',
    kind: 'User',
    metadata: {
      name,
      namespace: 'default',
      annotations: { [KEYCLOAK_ID_ANNOTATION]: id },
    },
    spec: {
      profile: {},
      memberOf,
    },
  };
}

describe('AdminEventsDeltaApplicator cascade DELETE / UPDATE', () => {
  const connection = {
    applyMutation: jest.fn(),
  } as unknown as EntityProviderConnection;

  const auth = {
    getOwnServiceCredentials: jest.fn().mockResolvedValue({
      $$type: '@backstage/BackstageCredentials',
      principal: { type: 'service', subject: 'test' },
    }),
  } as unknown as AuthService;

  const provider = {
    id: 'default',
    baseUrl: 'http://localhost:8080',
    loginRealm: 'master',
    realm: 'test',
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cascades GROUP DELETE to subgroups, refreshes parent and members', async () => {
    const parent = groupEntity('parent-id', 'parent', {
      childRefs: ['group:default/child'],
      children: ['child'],
    });
    const child = groupEntity('child-id', 'child', {
      parentRef: 'group:default/parent',
      childRefs: ['group:default/grand'],
      memberRefs: ['user:default/alice'],
      parent: 'parent',
      children: ['grand'],
      members: ['alice'],
    });
    const grand = groupEntity('grand-id', 'grand', {
      parentRef: 'group:default/child',
      parent: 'child',
    });
    const alice = userEntity('user-id', 'alice', ['child']);

    const catalog = {
      getEntities: jest.fn().mockResolvedValue({ items: [child] }),
      getEntityByRef: jest.fn(async (ref: string) => {
        if (ref === 'group:default/parent') return parent;
        if (ref === 'group:default/child') return child;
        if (ref === 'group:default/grand') return grand;
        if (ref === 'user:default/alice') return alice;
        return undefined;
      }),
      getEntitiesByRefs: jest.fn(
        async ({ entityRefs }: { entityRefs: string[] }) => ({
          items: entityRefs.map(ref => {
            if (ref === 'group:default/grand') return grand;
            if (ref === 'group:default/child') return child;
            return undefined;
          }),
        }),
      ),
    } as unknown as CatalogService;

    const client = {
      groups: {
        findOne: jest.fn(async ({ id }: { id: string }) => {
          if (id === 'parent-id') {
            return { id: 'parent-id', name: 'parent', subGroupCount: 0 };
          }
          return undefined;
        }),
        listSubGroups: jest.fn().mockResolvedValue([]),
        listMembers: jest.fn().mockResolvedValue([]),
      },
      users: {
        findOne: jest.fn().mockResolvedValue({
          id: 'user-id',
          username: 'alice',
          email: 'alice@example.com',
        }),
        listGroups: jest.fn().mockResolvedValue([]),
      },
    };

    const entityIndex = new Map<string, any>([
      ['parent-id', parent],
      ['child-id', child],
      ['grand-id', grand],
      ['user-id', alice],
    ]);

    const applicator = new AdminEventsDeltaApplicator({
      connection,
      provider,
      logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() } as any,
      locationKey: 'keycloak-org-provider:default',
      entityIndex,
      catalog,
      auth,
      withLocations: e => e,
    });

    const event: NormalizedAdminEvent = {
      time: 1,
      resourceType: 'GROUP',
      operationType: 'DELETE',
      resourcePath: 'groups/child-id',
      groupId: 'child-id',
    };

    await applicator.apply(event, client as any);

    expect(connection.applyMutation).toHaveBeenCalledTimes(1);
    const mutation = (connection.applyMutation as jest.Mock).mock.calls[0][0];
    const removedNames = mutation.removed.map(
      (entry: { entity: GroupEntity }) => entry.entity.metadata.name,
    );
    expect(removedNames).toEqual(
      expect.arrayContaining(['child', 'grand', 'parent', 'alice']),
    );
    const addedNames = mutation.added.map(
      (entry: { entity: GroupEntity }) => entry.entity.metadata.name,
    );
    expect(addedNames).toEqual(expect.arrayContaining(['parent', 'alice']));
    expect(entityIndex.has('child-id')).toBe(false);
    expect(entityIndex.has('grand-id')).toBe(false);
  });

  it('GROUP UPDATE refreshes old and new parents on reparent', async () => {
    const oldParent = groupEntity('old-parent', 'old-parent', {
      children: ['moved'],
      childRefs: ['group:default/moved'],
    });
    const newParent = groupEntity('new-parent', 'new-parent', {
      children: [],
    });
    const moved = groupEntity('moved-id', 'moved', {
      parentRef: 'group:default/old-parent',
      parent: 'old-parent',
    });

    const catalog = {
      getEntities: jest.fn().mockResolvedValue({ items: [moved] }),
      getEntityByRef: jest.fn(async (ref: string) => {
        if (ref === 'group:default/old-parent') return oldParent;
        return undefined;
      }),
      getEntitiesByRefs: jest.fn().mockResolvedValue({ items: [] }),
    } as unknown as CatalogService;

    const client = {
      groups: {
        findOne: jest.fn(async ({ id }: { id: string }) => {
          if (id === 'moved-id') {
            return {
              id: 'moved-id',
              name: 'moved',
              parentId: 'new-parent',
              subGroupCount: 0,
            };
          }
          if (id === 'old-parent') {
            return { id: 'old-parent', name: 'old-parent', subGroupCount: 0 };
          }
          if (id === 'new-parent') {
            return {
              id: 'new-parent',
              name: 'new-parent',
              subGroupCount: 1,
            };
          }
          return undefined;
        }),
        listSubGroups: jest.fn().mockResolvedValue([]),
        listMembers: jest.fn().mockResolvedValue([]),
      },
      users: {
        findOne: jest.fn(),
        listGroups: jest.fn(),
      },
    };

    const entityIndex = new Map<string, any>([
      ['old-parent', oldParent],
      ['new-parent', newParent],
      ['moved-id', moved],
    ]);

    const applicator = new AdminEventsDeltaApplicator({
      connection,
      provider,
      logger: { info: jest.fn(), debug: jest.fn(), error: jest.fn() } as any,
      locationKey: 'keycloak-org-provider:default',
      entityIndex,
      catalog,
      auth,
      withLocations: e => e,
    });

    await applicator.apply(
      {
        time: 2,
        resourceType: 'GROUP',
        operationType: 'UPDATE',
        resourcePath: 'groups/moved-id',
        groupId: 'moved-id',
      },
      client as any,
    );

    const mutation = (connection.applyMutation as jest.Mock).mock.calls[0][0];
    const addedIds = mutation.added.map(
      (entry: { entity: GroupEntity }) =>
        entry.entity.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION],
    );
    expect(addedIds).toEqual(
      expect.arrayContaining(['moved-id', 'old-parent', 'new-parent']),
    );
  });
});
