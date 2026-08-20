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

/**
 * SPIKE (RHIDP-15634): Admin Events API types for the local PoC.
 * Not intended for production merge without further productization.
 */

/** Keycloak Admin Event resource types relevant to org entity sync. */
export type AdminEventResourceType = 'USER' | 'GROUP' | 'GROUP_MEMBERSHIP';

/** Keycloak Admin Event operation types. */
export type AdminEventOperationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTION';

/**
 * Normalized admin event used by the poller / delta applicator.
 *
 * @public
 */
export type NormalizedAdminEvent = {
  time: number;
  resourceType: AdminEventResourceType;
  operationType: AdminEventOperationType;
  /** Keycloak resource path, e.g. `users/{id}` or `users/{id}/groups/{groupId}`. */
  resourcePath: string;
  userId?: string;
  groupId?: string;
  /** Set for nested subgroup creates under `groups/{parent}/children`. */
  parentGroupId?: string;
};

/**
 * In-memory poll cursor. Production would persist this across restarts.
 *
 * @public
 */
export type AdminEventsWatermark = {
  /** Exclusive lower bound: only events with `time` greater than this are processed. */
  lastEventTime: number;
};
