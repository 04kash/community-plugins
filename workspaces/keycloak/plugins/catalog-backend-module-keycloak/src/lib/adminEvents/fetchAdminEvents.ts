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

import type KeycloakAdminClient from '@keycloak/keycloak-admin-client';
import type AdminEventRepresentation from '@keycloak/keycloak-admin-client/lib/defs/adminEventRepresentation';

import { normalizeAdminEvents } from './mapAdminEvent';
import type { AdminEventsWatermark, NormalizedAdminEvent } from './types';

/** Resource types that affect Keycloak org entity ingestion. */
export const ORG_ADMIN_EVENT_RESOURCE_TYPES = [
  'USER',
  'GROUP',
  'GROUP_MEMBERSHIP',
] as const;

export type FetchAdminEventsOptions = {
  client: KeycloakAdminClient;
  realm: string;
  watermark?: AdminEventsWatermark;
  /** Page size passed to Keycloak (`max`). Defaults to 100. */
  maxResults?: number;
};

export type FetchAdminEventsResult = {
  events: NormalizedAdminEvent[];
  rawCount: number;
  /**
   * Suggested next watermark after processing `events`.
   * When no events were returned, equals the previous watermark (or "now" on first empty poll).
   */
  nextWatermark: AdminEventsWatermark;
};

/**
 * Poll Keycloak Admin Events API for org-relevant changes since the watermark.
 *
 * Uses `realms.findAdminEvents` from `@keycloak/keycloak-admin-client`.
 * Filters resource types server-side when possible; normalizes client-side.
 *
 * SPIKE (RHIDP-15634): pagination beyond the first page is intentionally omitted.
 */
export async function fetchAdminEventsSince(
  options: FetchAdminEventsOptions,
): Promise<FetchAdminEventsResult> {
  const { client, realm, watermark, maxResults = 100 } = options;

  const query: {
    realm: string;
    max: number;
    first: number;
    dateFrom?: string;
    resourceTypes?: string[];
  } = {
    realm,
    max: maxResults,
    first: 0,
    // Must be repeated query params (array). Comma-separated strings return HTTP 500.
    resourceTypes: [...ORG_ADMIN_EVENT_RESOURCE_TYPES],
  };

  if (watermark?.lastEventTime) {
    // Keycloak accepts ISO-8601; epoch millis are rejected.
    query.dateFrom = new Date(watermark.lastEventTime).toISOString();
  }

  const raw: AdminEventRepresentation[] = await client.realms.findAdminEvents(
    // admin-client types declare resourceTypes/dateFrom as string/Date; runtime
    // accepts string[] and ISO strings (see stringifyQueryParams).
    query as Parameters<KeycloakAdminClient['realms']['findAdminEvents']>[0],
  );

  const events = normalizeAdminEvents(raw, watermark?.lastEventTime);

  let nextLastEventTime = watermark?.lastEventTime;
  if (events.length > 0) {
    nextLastEventTime = events[events.length - 1].time;
  } else if (nextLastEventTime === undefined) {
    // First successful poll with no backlog: start cursor at "now" so we do not
    // replay the entire admin-event history on the next tick.
    nextLastEventTime = Date.now();
  }

  return {
    events,
    rawCount: raw.length,
    nextWatermark: { lastEventTime: nextLastEventTime! },
  };
}
