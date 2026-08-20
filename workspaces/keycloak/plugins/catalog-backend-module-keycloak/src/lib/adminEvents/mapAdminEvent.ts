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

import type AdminEventRepresentation from '@keycloak/keycloak-admin-client/lib/defs/adminEventRepresentation';

import type {
  AdminEventOperationType,
  AdminEventResourceType,
  NormalizedAdminEvent,
} from './types';

const SUPPORTED_RESOURCE_TYPES = new Set<AdminEventResourceType>([
  'USER',
  'GROUP',
  'GROUP_MEMBERSHIP',
]);

const SUPPORTED_OPERATION_TYPES = new Set<AdminEventOperationType>([
  'CREATE',
  'UPDATE',
  'DELETE',
]);

/**
 * Parse Keycloak admin-event resourcePath values used for org sync.
 *
 * Examples:
 * - `users/{userId}`
 * - `groups/{groupId}`
 * - `groups/{parentId}/children` (nested create; child id is in representation)
 * - `groups/{parentId}/children/{groupId}`
 * - `users/{userId}/groups/{groupId}`
 */
export function parseResourcePath(
  resourcePath: string,
  representation?: string,
): {
  userId?: string;
  groupId?: string;
  parentGroupId?: string;
} {
  const parts = resourcePath.split('/').filter(Boolean);

  if (parts[0] === 'users' && parts[2] === 'groups' && parts[3]) {
    return { userId: parts[1], groupId: parts[3] };
  }

  if (parts[0] === 'users' && parts[1]) {
    return { userId: parts[1] };
  }

  // Nested subgroup create: groups/{parentId}/children/{childId}
  if (parts[0] === 'groups' && parts[2] === 'children' && parts[3]) {
    return { parentGroupId: parts[1], groupId: parts[3] };
  }

  // Nested subgroup create without child id in path — id lives in representation
  // e.g. resourcePath=groups/{parentId}/children, representation={"id":"...","name":"..."}
  if (parts[0] === 'groups' && parts[2] === 'children' && !parts[3]) {
    const fromRepresentation = parseIdFromRepresentation(representation);
    return {
      parentGroupId: parts[1],
      groupId: fromRepresentation,
    };
  }

  if (parts[0] === 'groups' && parts[1] && parts.length === 2) {
    return { groupId: parts[1] };
  }

  return {};
}

function parseIdFromRepresentation(
  representation?: string,
): string | undefined {
  if (!representation) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(representation) as { id?: string };
    return typeof parsed.id === 'string' ? parsed.id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map a raw Keycloak AdminEventRepresentation into a normalized org-sync event.
 * Returns undefined when the event is irrelevant or incomplete.
 */
export function mapAdminEvent(
  event: AdminEventRepresentation,
): NormalizedAdminEvent | undefined {
  if (event.error) {
    return undefined;
  }

  const resourceType = event.resourceType as AdminEventResourceType | undefined;
  const operationType = event.operationType as
    | AdminEventOperationType
    | undefined;
  const resourcePath = event.resourcePath;
  const time = event.time;

  if (
    !resourceType ||
    !operationType ||
    !resourcePath ||
    time === undefined ||
    !SUPPORTED_RESOURCE_TYPES.has(resourceType) ||
    !SUPPORTED_OPERATION_TYPES.has(operationType)
  ) {
    return undefined;
  }

  const { userId, groupId, parentGroupId } = parseResourcePath(
    resourcePath,
    event.representation,
  );

  if (resourceType === 'USER' && !userId) {
    return undefined;
  }
  if (resourceType === 'GROUP' && !groupId) {
    return undefined;
  }
  if (resourceType === 'GROUP_MEMBERSHIP' && (!userId || !groupId)) {
    return undefined;
  }

  return {
    time,
    resourceType,
    operationType,
    resourcePath,
    userId,
    groupId,
    parentGroupId,
  };
}

/**
 * Filter and map raw admin events, then sort ascending by time for ordered apply.
 */
export function normalizeAdminEvents(
  events: AdminEventRepresentation[],
  afterTimeExclusive?: number,
): NormalizedAdminEvent[] {
  return events
    .map(mapAdminEvent)
    .filter((event): event is NormalizedAdminEvent => {
      if (!event) {
        return false;
      }
      if (
        afterTimeExclusive !== undefined &&
        event.time <= afterTimeExclusive
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.time - b.time);
}
