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

import type { AuthService, LoggerService } from '@backstage/backend-plugin-api';
import type { Entity, GroupEntity, UserEntity } from '@backstage/catalog-model';
import { stringifyEntityRef } from '@backstage/catalog-model';
import type {
  CatalogService,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import type KeycloakAdminClient from '@keycloak/keycloak-admin-client';

import { KEYCLOAK_ID_ANNOTATION } from '../constants';
import { parseGroup, parseUser } from '../read';
import type { KeycloakProviderConfig } from '../config';
import type {
  GroupRepresentationWithParent,
  GroupTransformer,
  UserTransformer,
} from '../types';
import type { NormalizedAdminEvent } from './types';

export type EntityLocationMapper = (entity: Entity) => Entity;

/**
 * SPIKE (RHIDP-15634): admin-event delta applicator.
 *
 * Mirrors the Events System PoC patterns:
 * - CatalogService lookups by Keycloak id annotation / entity refs
 * - Cascade GROUP DELETE (subgroups + member users + parent refresh)
 * - GROUP UPDATE rename/move (refresh group, old/new parents, subgroups, members)
 *
 * Falls back to the in-memory entity index when CatalogService is unavailable
 * or has not yet processed relations.
 */
export class AdminEventsDeltaApplicator {
  constructor(
    private readonly options: {
      connection: EntityProviderConnection;
      provider: KeycloakProviderConfig;
      logger: LoggerService;
      withLocations: EntityLocationMapper;
      locationKey: string;
      userTransformer?: UserTransformer;
      groupTransformer?: GroupTransformer;
      /** Mutable Keycloak id → last ingested entity. */
      entityIndex: Map<string, Entity>;
      catalog?: CatalogService;
      auth?: AuthService;
    },
  ) {}

  async apply(event: NormalizedAdminEvent, client: KeycloakAdminClient) {
    switch (event.resourceType) {
      case 'USER':
        await this.applyUserEvent(event, client);
        break;
      case 'GROUP':
        await this.applyGroupEvent(event, client);
        break;
      case 'GROUP_MEMBERSHIP':
        await this.applyMembershipEvent(event, client);
        break;
      default:
        break;
    }
  }

  private async applyUserEvent(
    event: NormalizedAdminEvent,
    client: KeycloakAdminClient,
  ) {
    const userId = event.userId!;
    const { logger, entityIndex } = this.options;

    if (event.operationType === 'DELETE') {
      const existing =
        (await this.findEntityByKeycloakId('User', userId)) ??
        entityIndex.get(userId);
      if (!existing) {
        logger.debug(
          `Admin event USER DELETE for ${userId}: no catalog/index entity; skipping (full sync will reconcile)`,
        );
        return;
      }
      await this.mutate({ added: [], removed: [existing] });
      entityIndex.delete(userId);
      logger.info(`Applied admin event USER DELETE for ${userId}`);
      return;
    }

    const entity = await this.buildUserEntity(userId, client);
    if (!entity) {
      logger.debug(
        `Admin event USER ${event.operationType}: user ${userId} not found`,
      );
      return;
    }

    const previous =
      (await this.findEntityByKeycloakId('User', userId)) ??
      entityIndex.get(userId);
    await this.mutate({
      added: [entity],
      removed: previous ? [previous] : [],
    });
    entityIndex.set(userId, entity);
    logger.info(
      `Applied admin event USER ${event.operationType} for ${userId}`,
    );
  }

  private async applyGroupEvent(
    event: NormalizedAdminEvent,
    client: KeycloakAdminClient,
  ) {
    if (event.operationType === 'DELETE') {
      await this.applyGroupDelete(event.groupId!, client);
      return;
    }
    if (event.operationType === 'UPDATE') {
      await this.applyGroupUpdate(event, client);
      return;
    }
    await this.applyGroupCreate(event, client);
  }

  private async applyGroupCreate(
    event: NormalizedAdminEvent,
    client: KeycloakAdminClient,
  ) {
    const groupId = event.groupId!;
    const { logger, provider, entityIndex } = this.options;

    const entity = await this.buildGroupEntity(groupId, client, {
      parentGroupId: event.parentGroupId,
    });
    if (!entity) {
      logger.debug(
        `Admin event GROUP CREATE: group ${groupId} not found (may already be deleted)`,
      );
      return;
    }

    const previous =
      (await this.findEntityByKeycloakId('Group', groupId)) ??
      entityIndex.get(groupId);
    const added: Entity[] = [entity];
    const removed: Entity[] = previous ? [previous] : [];

    if (event.parentGroupId) {
      const refreshedParent = await this.buildGroupEntity(
        event.parentGroupId,
        client,
      );
      if (refreshedParent) {
        const prevParent =
          (await this.findEntityByKeycloakId('Group', event.parentGroupId)) ??
          entityIndex.get(event.parentGroupId);
        added.push(refreshedParent);
        if (prevParent) {
          removed.push(prevParent);
        }
        entityIndex.set(event.parentGroupId, refreshedParent);
      }
    }

    await this.mutate({ added, removed });
    entityIndex.set(groupId, entity);
    logger.info(
      `Applied admin event GROUP CREATE for ${groupId}${
        event.parentGroupId ? ` (parent ${event.parentGroupId})` : ''
      }`,
    );
  }

  /**
   * Cascade delete aligned with the Events PoC `handleGroupDelete`:
   * remove the group and catalog subgroups, refresh the parent, refresh members.
   */
  private async applyGroupDelete(groupId: string, client: KeycloakAdminClient) {
    const { logger, entityIndex } = this.options;

    const deletedGroup =
      ((await this.findEntityByKeycloakId('Group', groupId)) as
        | GroupEntity
        | undefined) ?? (entityIndex.get(groupId) as GroupEntity | undefined);

    if (!deletedGroup) {
      logger.debug(
        `Admin event GROUP DELETE for ${groupId}: no catalog/index entity; skipping`,
      );
      return;
    }

    const subgroupEntities = await this.collectDescendantGroups(deletedGroup);
    const parentEntity = await this.getParentEntity(deletedGroup);

    const memberRefs = this.collectMemberRefs(deletedGroup, subgroupEntities);
    const { oldUsers, newUsers } = await this.refreshUsersByRefs(
      memberRefs,
      client,
    );

    const added: Entity[] = [...newUsers];
    const removed: Entity[] = [deletedGroup, ...subgroupEntities, ...oldUsers];

    if (parentEntity) {
      const parentKeycloakId =
        parentEntity.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      removed.push(parentEntity);
      if (parentKeycloakId) {
        const refreshedParent = await this.buildGroupEntity(
          parentKeycloakId,
          client,
        );
        if (refreshedParent) {
          added.push(refreshedParent);
          entityIndex.set(parentKeycloakId, refreshedParent);
        } else {
          entityIndex.delete(parentKeycloakId);
        }
      }
    }

    await this.mutate({ added, removed });

    entityIndex.delete(groupId);
    for (const subgroup of subgroupEntities) {
      const id = subgroup.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (id) {
        entityIndex.delete(id);
      }
    }
    for (const user of oldUsers) {
      const id = user.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (id) {
        entityIndex.delete(id);
      }
    }
    for (const user of newUsers) {
      const id = user.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (id) {
        entityIndex.set(id, user);
      }
    }

    logger.info(
      `Applied admin event GROUP DELETE for ${groupId} (cascade ${subgroupEntities.length} subgroup(s), refresh ${newUsers.length} member(s))`,
    );
  }

  /**
   * GROUP UPDATE covering rename and reparent (Events PoC TODO).
   * Refreshes the group, old parent, new parent, direct subgroups, and members.
   */
  private async applyGroupUpdate(
    event: NormalizedAdminEvent,
    client: KeycloakAdminClient,
  ) {
    const groupId = event.groupId!;
    const { logger, entityIndex } = this.options;

    const previous =
      ((await this.findEntityByKeycloakId('Group', groupId)) as
        | GroupEntity
        | undefined) ?? (entityIndex.get(groupId) as GroupEntity | undefined);

    const entity = await this.buildGroupEntity(groupId, client);
    if (!entity) {
      logger.debug(`Admin event GROUP UPDATE: group ${groupId} not found`);
      return;
    }

    const added: Entity[] = [entity];
    const removed: Entity[] = previous ? [previous] : [];

    const oldParent = previous
      ? await this.getParentEntity(previous)
      : undefined;
    const newParentId = await this.resolveKeycloakParentId(groupId, client);
    const oldParentId =
      oldParent?.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];

    const parentIdsToRefresh = new Set<string>();
    if (oldParentId) {
      parentIdsToRefresh.add(oldParentId);
    }
    if (newParentId) {
      parentIdsToRefresh.add(newParentId);
    }

    for (const parentId of parentIdsToRefresh) {
      const prevParent =
        (await this.findEntityByKeycloakId('Group', parentId)) ??
        entityIndex.get(parentId);
      if (prevParent) {
        removed.push(prevParent);
      }
      const refreshed = await this.buildGroupEntity(parentId, client);
      if (refreshed) {
        added.push(refreshed);
        entityIndex.set(parentId, refreshed);
      }
    }

    // On rename or any update, refresh catalog subgroups so parent name/links stay correct.
    const subgroups = previous
      ? await this.collectDirectSubgroups(previous)
      : [];
    for (const subgroup of subgroups) {
      const subId = subgroup.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (!subId) {
        continue;
      }
      removed.push(subgroup);
      const refreshedSub = await this.buildGroupEntity(subId, client, {
        parentName: entity.metadata.name,
      });
      if (refreshedSub) {
        added.push(refreshedSub);
        entityIndex.set(subId, refreshedSub);
      } else {
        entityIndex.delete(subId);
      }
    }

    const memberRefs = this.collectMemberRefs(
      (previous as GroupEntity) ?? (entity as GroupEntity),
      subgroups,
    );
    const { oldUsers, newUsers } = await this.refreshUsersByRefs(
      memberRefs,
      client,
    );
    removed.push(...oldUsers);
    added.push(...newUsers);
    for (const user of oldUsers) {
      const id = user.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (id) {
        entityIndex.delete(id);
      }
    }
    for (const user of newUsers) {
      const id = user.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (id) {
        entityIndex.set(id, user);
      }
    }

    await this.mutate({ added, removed });
    entityIndex.set(groupId, entity);

    const renamed =
      previous && previous.metadata.name !== entity.metadata.name
        ? ` renamed ${previous.metadata.name}→${entity.metadata.name}`
        : '';
    const moved =
      oldParentId && newParentId && oldParentId !== newParentId
        ? ` moved ${oldParentId}→${newParentId}`
        : '';
    logger.info(
      `Applied admin event GROUP UPDATE for ${groupId}${renamed}${moved}`,
    );
  }

  private async applyMembershipEvent(
    event: NormalizedAdminEvent,
    client: KeycloakAdminClient,
  ) {
    const { logger } = this.options;
    if (!event.userId || !event.groupId) {
      return;
    }

    await this.applyUserEvent(
      {
        ...event,
        resourceType: 'USER',
        operationType: 'UPDATE',
        resourcePath: `users/${event.userId}`,
      },
      client,
    );
    await this.applyGroupEvent(
      {
        ...event,
        resourceType: 'GROUP',
        operationType: 'UPDATE',
        resourcePath: `groups/${event.groupId}`,
        parentGroupId: undefined,
      },
      client,
    );
    logger.info(
      `Applied admin event GROUP_MEMBERSHIP ${event.operationType} for user ${event.userId} group ${event.groupId}`,
    );
  }

  private async buildUserEntity(
    userId: string,
    client: KeycloakAdminClient,
  ): Promise<UserEntity | undefined> {
    const { provider } = this.options;
    const user = await client.users.findOne({
      id: userId,
      realm: provider.realm,
    });
    if (!user?.username) {
      return undefined;
    }

    let memberOf: string[] = [];
    try {
      const groups = await client.users.listGroups({
        id: userId,
        realm: provider.realm,
      });
      memberOf = (groups ?? [])
        .map(group => group.name)
        .filter((name): name is string => Boolean(name));
    } catch {
      // Membership list is best-effort for the spike.
    }

    const groupIndex = new Map<string, string[]>([[user.username, memberOf]]);
    return parseUser(
      user,
      provider.realm,
      [],
      groupIndex,
      this.options.userTransformer,
    );
  }

  private async buildGroupEntity(
    groupId: string,
    client: KeycloakAdminClient,
    hints?: { parentGroupId?: string; parentName?: string },
  ): Promise<GroupEntity | undefined> {
    const { provider, entityIndex } = this.options;
    const group = (await client.groups.findOne({
      id: groupId,
      realm: provider.realm,
    })) as GroupRepresentationWithParent | undefined;
    if (!group) {
      return undefined;
    }

    if (hints?.parentName) {
      group.parent = hints.parentName;
    } else if (hints?.parentGroupId) {
      const parentEntity =
        entityIndex.get(hints.parentGroupId) ??
        (await this.findEntityByKeycloakId('Group', hints.parentGroupId));
      if (parentEntity?.metadata.name) {
        group.parent = parentEntity.metadata.name;
      } else {
        const parent = await client.groups.findOne({
          id: hints.parentGroupId,
          realm: provider.realm,
        });
        group.parent = parent?.name;
      }
    } else if (group.parentId) {
      const parent = await client.groups.findOne({
        id: group.parentId,
        realm: provider.realm,
      });
      group.parent = parent?.name;
    }

    try {
      if (group.subGroupCount && group.subGroupCount > 0) {
        group.subGroups = await client.groups.listSubGroups({
          parentId: groupId,
          first: 0,
          max: group.subGroupCount,
          briefRepresentation: true,
          realm: provider.realm,
        });
      }
    } catch {
      // Children are best-effort.
    }

    try {
      const members = await client.groups.listMembers({
        id: groupId,
        realm: provider.realm,
      });
      group.members = (members ?? [])
        .map(member => member.username)
        .filter((name): name is string => Boolean(name));
    } catch {
      // Members are best-effort.
    }

    return parseGroup(group, provider.realm, this.options.groupTransformer);
  }

  private async resolveKeycloakParentId(
    groupId: string,
    client: KeycloakAdminClient,
  ): Promise<string | undefined> {
    const { provider } = this.options;
    const group = (await client.groups.findOne({
      id: groupId,
      realm: provider.realm,
    })) as GroupRepresentationWithParent | undefined;
    return group?.parentId;
  }

  private async findEntityByKeycloakId(
    kind: 'User' | 'Group',
    keycloakId: string,
  ): Promise<Entity | undefined> {
    const { catalog, auth } = this.options;
    if (!catalog || !auth) {
      return undefined;
    }
    const credentials = await auth.getOwnServiceCredentials();
    const { items } = await catalog.getEntities(
      {
        filter: {
          kind,
          [`metadata.annotations.${KEYCLOAK_ID_ANNOTATION}`]: keycloakId,
        },
      },
      { credentials },
    );
    return items[0];
  }

  private async getParentEntity(
    group: GroupEntity,
  ): Promise<Entity | undefined> {
    const parentRef = group.relations?.find(
      relation => relation.type === 'childOf',
    )?.targetRef;
    if (parentRef) {
      return this.getEntityByRef(parentRef);
    }
    // Fall back to spec.parent via entity index when relations are not present yet.
    const parentName = group.spec?.parent;
    if (!parentName) {
      return undefined;
    }
    for (const entity of this.options.entityIndex.values()) {
      if (entity.kind === 'Group' && entity.metadata.name === parentName) {
        return entity;
      }
    }
    return undefined;
  }

  private async collectDirectSubgroups(
    group: GroupEntity,
  ): Promise<GroupEntity[]> {
    const refs =
      group.relations
        ?.filter(relation => relation.type === 'parentOf')
        .map(relation => relation.targetRef) ?? [];
    if (refs.length > 0) {
      const entities = await this.getEntitiesByRefs(refs);
      return entities.filter(
        (entity): entity is GroupEntity => entity.kind === 'Group',
      );
    }

    const childNames = new Set(group.spec?.children ?? []);
    if (childNames.size === 0) {
      return [];
    }
    const fromIndex: GroupEntity[] = [];
    for (const entity of this.options.entityIndex.values()) {
      if (entity.kind === 'Group' && childNames.has(entity.metadata.name)) {
        fromIndex.push(entity as GroupEntity);
      }
    }
    return fromIndex;
  }

  private async collectDescendantGroups(
    group: GroupEntity,
  ): Promise<GroupEntity[]> {
    const result: GroupEntity[] = [];
    const queue = await this.collectDirectSubgroups(group);
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      const children = await this.collectDirectSubgroups(current);
      queue.push(...children);
    }
    return result;
  }

  private collectMemberRefs(
    group: GroupEntity,
    subgroups: GroupEntity[],
  ): string[] {
    const refs = new Set<string>();
    for (const entity of [group, ...subgroups]) {
      for (const relation of entity.relations ?? []) {
        if (relation.type === 'hasMember') {
          refs.add(relation.targetRef);
        }
      }
      for (const member of entity.spec?.members ?? []) {
        refs.add(`user:default/${member}`.toLowerCase());
      }
    }
    return [...refs];
  }

  private async refreshUsersByRefs(
    userRefs: string[],
    client: KeycloakAdminClient,
  ): Promise<{ oldUsers: Entity[]; newUsers: Entity[] }> {
    const oldUsers: Entity[] = [];
    const newUsers: Entity[] = [];

    for (const ref of userRefs) {
      const existing =
        (await this.getEntityByRef(ref)) ?? this.findIndexedUserByRef(ref);
      if (!existing) {
        continue;
      }
      oldUsers.push(existing);
      const keycloakId =
        existing.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
      if (!keycloakId) {
        continue;
      }
      const refreshed = await this.buildUserEntity(keycloakId, client);
      if (refreshed) {
        newUsers.push(refreshed);
      }
    }

    return { oldUsers, newUsers };
  }

  private findIndexedUserByRef(ref: string): Entity | undefined {
    for (const entity of this.options.entityIndex.values()) {
      if (entity.kind !== 'User') {
        continue;
      }
      if (stringifyEntityRef(entity) === ref) {
        return entity;
      }
    }
    return undefined;
  }

  private async getEntityByRef(ref: string): Promise<Entity | undefined> {
    const { catalog, auth } = this.options;
    if (!catalog || !auth) {
      return undefined;
    }
    const credentials = await auth.getOwnServiceCredentials();
    return catalog.getEntityByRef(ref, { credentials });
  }

  private async getEntitiesByRefs(refs: string[]): Promise<Entity[]> {
    const { catalog, auth } = this.options;
    if (!catalog || !auth || refs.length === 0) {
      return [];
    }
    const credentials = await auth.getOwnServiceCredentials();
    const { items } = await catalog.getEntitiesByRefs(
      { entityRefs: refs },
      { credentials },
    );
    return items.filter((entity): entity is Entity => Boolean(entity));
  }

  private async mutate(options: { added: Entity[]; removed: Entity[] }) {
    const { connection, withLocations, locationKey } = this.options;
    // Deduplicate by entity ref so rename/move refresh paths stay safe.
    const uniq = (entities: Entity[]) => {
      const seen = new Set<string>();
      const out: Entity[] = [];
      for (const entity of entities) {
        const ref = stringifyEntityRef(entity);
        if (seen.has(ref)) {
          continue;
        }
        seen.add(ref);
        out.push(entity);
      }
      return out;
    };

    await connection.applyMutation({
      type: 'delta',
      added: uniq(options.added).map(entity => ({
        locationKey,
        entity: withLocations(entity),
      })),
      removed: uniq(options.removed).map(entity => ({
        locationKey,
        entity: withLocations(entity),
      })),
    });
  }
}

/** Index entities from a full sync by Keycloak id annotation. */
export function indexEntitiesByKeycloakId(
  entities: Entity[],
): Map<string, Entity> {
  const index = new Map<string, Entity>();
  for (const entity of entities) {
    const id = entity.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION];
    if (id) {
      index.set(id, entity);
    }
  }
  return index;
}
