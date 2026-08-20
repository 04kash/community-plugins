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

import { fetchAdminEventsSince } from './fetchAdminEvents';

describe('fetchAdminEventsSince', () => {
  it('normalizes events and advances the watermark', async () => {
    const raw: AdminEventRepresentation[] = [
      {
        time: 100,
        operationType: 'CREATE',
        resourceType: 'USER',
        resourcePath: 'users/u-1',
      },
      {
        time: 200,
        operationType: 'DELETE',
        resourceType: 'GROUP',
        resourcePath: 'groups/g-1',
      },
    ];

    const findAdminEvents = jest.fn().mockResolvedValue(raw);
    const client = { realms: { findAdminEvents } } as any;

    const result = await fetchAdminEventsSince({
      client,
      realm: 'myrealm',
      watermark: { lastEventTime: 50 },
      maxResults: 50,
    });

    expect(findAdminEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        realm: 'myrealm',
        max: 50,
        first: 0,
        resourceTypes: ['USER', 'GROUP', 'GROUP_MEMBERSHIP'],
        dateFrom: new Date(50).toISOString(),
      }),
    );
    expect(result.events).toHaveLength(2);
    expect(result.nextWatermark).toEqual({ lastEventTime: 200 });
  });

  it('initializes watermark to now when the first poll is empty', async () => {
    const findAdminEvents = jest.fn().mockResolvedValue([]);
    const client = { realms: { findAdminEvents } } as any;
    const before = Date.now();

    const result = await fetchAdminEventsSince({
      client,
      realm: 'myrealm',
    });

    expect(result.events).toEqual([]);
    expect(result.nextWatermark.lastEventTime).toBeGreaterThanOrEqual(before);
  });
});
