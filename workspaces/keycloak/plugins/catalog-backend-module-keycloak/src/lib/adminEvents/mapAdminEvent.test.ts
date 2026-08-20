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

import {
  mapAdminEvent,
  normalizeAdminEvents,
  parseResourcePath,
} from './mapAdminEvent';

describe('parseResourcePath', () => {
  it('parses user paths', () => {
    expect(parseResourcePath('users/abc-123')).toEqual({ userId: 'abc-123' });
  });

  it('parses group paths', () => {
    expect(parseResourcePath('groups/g-1')).toEqual({ groupId: 'g-1' });
  });

  it('parses nested group children paths with child id', () => {
    expect(parseResourcePath('groups/parent/children/child')).toEqual({
      parentGroupId: 'parent',
      groupId: 'child',
    });
  });

  it('parses nested create path using representation id', () => {
    expect(
      parseResourcePath(
        'groups/parent-id/children',
        '{"id":"child-id","name":"evt-child","subGroups":[]}',
      ),
    ).toEqual({
      parentGroupId: 'parent-id',
      groupId: 'child-id',
    });
  });

  it('does not treat groups/{id}/children as the parent group id', () => {
    expect(parseResourcePath('groups/parent-id/children')).toEqual({
      parentGroupId: 'parent-id',
      groupId: undefined,
    });
  });

  it('parses membership paths', () => {
    expect(parseResourcePath('users/u-1/groups/g-1')).toEqual({
      userId: 'u-1',
      groupId: 'g-1',
    });
  });
});

describe('mapAdminEvent', () => {
  const base: AdminEventRepresentation = {
    time: 1_700_000_000_000,
    operationType: 'CREATE',
    resourceType: 'USER',
    resourcePath: 'users/u-1',
  };

  it('maps a supported user create event', () => {
    expect(mapAdminEvent(base)).toEqual({
      time: 1_700_000_000_000,
      operationType: 'CREATE',
      resourceType: 'USER',
      resourcePath: 'users/u-1',
      userId: 'u-1',
      groupId: undefined,
      parentGroupId: undefined,
    });
  });

  it('ignores events with errors', () => {
    expect(mapAdminEvent({ ...base, error: 'denied' })).toBeUndefined();
  });

  it('ignores unsupported resource types', () => {
    expect(
      mapAdminEvent({
        ...base,
        resourceType: 'CLIENT',
        resourcePath: 'clients/c1',
      }),
    ).toBeUndefined();
  });

  it('maps group membership events', () => {
    expect(
      mapAdminEvent({
        time: 10,
        operationType: 'CREATE',
        resourceType: 'GROUP_MEMBERSHIP',
        resourcePath: 'users/u-1/groups/g-1',
      }),
    ).toEqual({
      time: 10,
      operationType: 'CREATE',
      resourceType: 'GROUP_MEMBERSHIP',
      resourcePath: 'users/u-1/groups/g-1',
      userId: 'u-1',
      groupId: 'g-1',
      parentGroupId: undefined,
    });
  });

  it('maps nested subgroup create from representation', () => {
    expect(
      mapAdminEvent({
        time: 11,
        operationType: 'CREATE',
        resourceType: 'GROUP',
        resourcePath: 'groups/parent-id/children',
        representation: '{"id":"child-id","name":"evt-child"}',
      }),
    ).toEqual({
      time: 11,
      operationType: 'CREATE',
      resourceType: 'GROUP',
      resourcePath: 'groups/parent-id/children',
      userId: undefined,
      groupId: 'child-id',
      parentGroupId: 'parent-id',
    });
  });
});

describe('normalizeAdminEvents', () => {
  it('filters by watermark, drops noise, and sorts by time', () => {
    const raw: AdminEventRepresentation[] = [
      {
        time: 30,
        operationType: 'UPDATE',
        resourceType: 'USER',
        resourcePath: 'users/u-2',
      },
      {
        time: 10,
        operationType: 'CREATE',
        resourceType: 'CLIENT',
        resourcePath: 'clients/c-1',
      },
      {
        time: 20,
        operationType: 'CREATE',
        resourceType: 'USER',
        resourcePath: 'users/u-1',
      },
      {
        time: 5,
        operationType: 'CREATE',
        resourceType: 'USER',
        resourcePath: 'users/old',
      },
    ];

    expect(normalizeAdminEvents(raw, 10).map(e => e.userId)).toEqual([
      'u-1',
      'u-2',
    ]);
  });
});
