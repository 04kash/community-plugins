/*
 * Copyright 2024 The Backstage Authors
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

import type {
  AuthService,
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskRunner,
} from '@backstage/backend-plugin-api';
import {
  ANNOTATION_LOCATION,
  ANNOTATION_ORIGIN_LOCATION,
  type Entity,
} from '@backstage/catalog-model';
import type { Config } from '@backstage/config';
import { InputError, isError, NotFoundError } from '@backstage/errors';
import type {
  CatalogService,
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';

import KeyCloakAdminClient from '@keycloak/keycloak-admin-client';
import { Attributes, Counter, Meter, metrics } from '@opentelemetry/api';
// @ts-ignore
import { merge } from 'lodash';
import pLimit from 'p-limit';
import { v4 as uuidv4 } from 'uuid';

import {
  GroupTransformer,
  KEYCLOAK_ID_ANNOTATION,
  KeycloakProviderConfig,
  UserTransformer,
} from '../lib';
import { readProviderConfigs } from '../lib/config';
import { readKeycloakRealm } from '../lib/read';
import { authenticate } from '../lib/authenticate';
import {
  AdminEventsDeltaApplicator,
  AdminEventsWatermark,
  fetchAdminEventsSince,
  indexEntitiesByKeycloakId,
} from '../lib/adminEvents';

/**
 * Options for {@link KeycloakOrgEntityProvider}.
 *
 * @public
 */
export interface KeycloakOrgEntityProviderOptions {
  /**
   * A unique, stable identifier for this provider.
   *
   * @example "production"
   */
  id: string;

  /**
   * The refresh schedule to use.
   * @remarks
   *
   * You can pass in the result of
   * {@link @backstage/backend-plugin-api#SchedulerService.createScheduledTaskRunner}
   * to enable automatic scheduling of tasks.
   */
  schedule?: SchedulerServiceTaskRunner;

  /**
   * Scheduler used to schedule refreshes based on
   * the schedule config.
   */
  scheduler?: SchedulerService;

  /**
   * The logger to use.
   */
  logger: LoggerService;

  /**
   * The function that transforms a user entry in LDAP to an entity.
   */
  userTransformer?: UserTransformer;

  /**
   * The function that transforms a group entry in LDAP to an entity.
   */
  groupTransformer?: GroupTransformer;
}

// Makes sure that emitted entities have a proper location
export const withLocations = (
  baseUrl: string,
  realm: string,
  entity: Entity,
): Entity => {
  const kind = entity.kind === 'Group' ? 'groups' : 'users';
  const location = `url:${baseUrl}/admin/realms/${realm}/${kind}/${entity.metadata.annotations?.[KEYCLOAK_ID_ANNOTATION]}`;
  return merge(
    {
      metadata: {
        annotations: {
          [ANNOTATION_LOCATION]: location,
          [ANNOTATION_ORIGIN_LOCATION]: location,
        },
      },
    },
    entity,
  ) as Entity;
};

/**
 * Ingests org data (users and groups) from GitHub.
 *
 * @public
 */
export class KeycloakOrgEntityProvider implements EntityProvider {
  private connection?: EntityProviderConnection;
  private meter: Meter;
  private counter: Counter<Attributes>;
  private scheduleFn?: () => Promise<void>;
  /** SPIKE (RHIDP-15634): admin-events poll scheduler starter */
  private adminEventsScheduleFn?: () => Promise<void>;
  /** SPIKE (RHIDP-15634): in-memory poll cursor (not persisted across restarts) */
  private adminEventsWatermark?: AdminEventsWatermark;
  /** SPIKE (RHIDP-15634): Keycloak id → entity cache (CatalogService is source of truth for cascade) */
  private entityIndex = new Map<string, Entity>();

  /**
   * Static builder method to create multiple KeycloakOrgEntityProvider instances from a single config.
   * @param deps - The dependencies required for the provider, including the configuration and logger.
   * @param options - Options for scheduling tasks and transforming users and groups.
   * @returns An array of KeycloakOrgEntityProvider instances.
   */
  static fromConfig(
    deps: {
      config: Config;
      logger: LoggerService;
      /** Optional: enables CatalogService-backed cascade delete / rename-move. */
      catalog?: CatalogService;
      auth?: AuthService;
    },
    options: (
      | { schedule: SchedulerServiceTaskRunner }
      | { scheduler: SchedulerService }
    ) & {
      userTransformer?: UserTransformer;
      groupTransformer?: GroupTransformer;
    },
  ): KeycloakOrgEntityProvider[] {
    const { config, logger, catalog, auth } = deps;
    return readProviderConfigs(config).map(providerConfig => {
      let taskRunner: SchedulerServiceTaskRunner | string;
      if ('scheduler' in options && providerConfig.schedule) {
        // Create a scheduled task runner using the provided scheduler and schedule configuration
        taskRunner = options.scheduler.createScheduledTaskRunner(
          providerConfig.schedule,
        );
      } else if ('schedule' in options) {
        // Use the provided schedule directly
        taskRunner = options.schedule;
      } else {
        throw new InputError(
          `No schedule provided via config for KeycloakOrgEntityProvider:${providerConfig.id}.`,
        );
      }

      let adminEventsTaskRunner: SchedulerServiceTaskRunner | undefined;
      if (providerConfig.adminEvents?.enabled) {
        if (!('scheduler' in options) || !providerConfig.adminEvents.schedule) {
          throw new InputError(
            `Admin events polling requires a scheduler and adminEvents.schedule for KeycloakOrgEntityProvider:${providerConfig.id}.`,
          );
        }
        adminEventsTaskRunner = options.scheduler.createScheduledTaskRunner(
          providerConfig.adminEvents.schedule,
        );
      }

      const provider = new KeycloakOrgEntityProvider({
        id: providerConfig.id,
        provider: providerConfig,
        logger: logger,
        taskRunner: taskRunner,
        adminEventsTaskRunner,
        catalog,
        auth,
        userTransformer: options.userTransformer,
        groupTransformer: options.groupTransformer,
      });

      return provider;
    });
  }

  constructor(
    private options: {
      id: string;
      provider: KeycloakProviderConfig;
      logger: LoggerService;
      taskRunner: SchedulerServiceTaskRunner;
      adminEventsTaskRunner?: SchedulerServiceTaskRunner;
      catalog?: CatalogService;
      auth?: AuthService;
      userTransformer?: UserTransformer;
      groupTransformer?: GroupTransformer;
    },
  ) {
    this.meter = metrics.getMeter('default');
    this.counter = this.meter.createCounter(
      'backend_keycloak.fetch.task.failure.count',
      {
        description:
          'Counts the number of failed Keycloak data fetch tasks. Each increment indicates a complete failure of a fetch task, meaning no data was provided to the Catalog API. However, data may still be fetched in subsequent tasks, depending on the nature of the error.',
      },
    );
    this.schedule(options.taskRunner);
    if (options.adminEventsTaskRunner) {
      this.scheduleAdminEvents(options.adminEventsTaskRunner);
    }
  }

  /**
   * Returns the name of this entity provider.
   */
  getProviderName(): string {
    return `KeycloakOrgEntityProvider:${this.options.id}`;
  }

  /**
   * Connect to Backstage catalog entity provider
   * @param connection - The connection to the catalog API ingestor, which allows the provision of new entities.
   */
  async connect(connection: EntityProviderConnection) {
    this.connection = connection;
    await this.scheduleFn?.();
    await this.adminEventsScheduleFn?.();
  }

  /**
   * Runs one complete ingestion loop. Call this method regularly at some
   * appropriate cadence.
   */
  async read(options: { logger?: LoggerService; taskInstanceId: string }) {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }

    const logger = options?.logger ?? this.options.logger;
    const provider = this.options.provider;

    const { markReadComplete } = trackProgress(logger);

    const kcAdminClient = new KeyCloakAdminClient({
      baseUrl: provider.baseUrl,
      realmName: provider.loginRealm,
    });
    await authenticate(kcAdminClient, provider, logger);

    const concurrency = provider.maxConcurrency ?? 20;
    const limit = pLimit(concurrency);

    const dataBatchFailureCounter = this.meter.createCounter(
      'backend_keycloak.fetch.data.batch.failure.count',
      {
        description:
          'Keycloak data batch fetch failure counter. Incremented for each batch fetch failure. Each failure means that a part of the data was not fetched due to an error, and thus the corresponding data batch was skipped during the current fetch task.',
      },
    );
    const { users, groups } = await readKeycloakRealm(
      kcAdminClient,
      provider,
      logger,
      limit,
      options.taskInstanceId,
      dataBatchFailureCounter,
      {
        userQuerySize: provider.userQuerySize,
        groupQuerySize: provider.groupQuerySize,
        userTransformer: this.options.userTransformer,
        groupTransformer: this.options.groupTransformer,
      },
    );

    const { markCommitComplete } = markReadComplete({ users, groups });

    const entities = [...users, ...groups].map(entity =>
      withLocations(provider.baseUrl, provider.realm, entity),
    );

    await this.connection.applyMutation({
      type: 'full',
      entities: entities.map(entity => ({
        locationKey: `keycloak-org-provider:${this.options.id}`,
        entity,
      })),
    });

    // SPIKE (RHIDP-15634): refresh in-memory index used by admin-event deltas
    this.entityIndex = indexEntitiesByKeycloakId(entities);

    markCommitComplete();
  }

  /**
   * SPIKE (RHIDP-15634): poll Admin Events API and apply catalog delta mutations.
   */
  async readAdminEvents(options: { logger?: LoggerService }) {
    if (!this.connection) {
      throw new NotFoundError('Not initialized');
    }
    if (!this.options.provider.adminEvents?.enabled) {
      return;
    }

    const logger = options.logger ?? this.options.logger;
    const provider = this.options.provider;

    const kcAdminClient = new KeyCloakAdminClient({
      baseUrl: provider.baseUrl,
      realmName: provider.loginRealm,
    });
    await authenticate(kcAdminClient, provider, logger);

    const { events, rawCount, nextWatermark } = await fetchAdminEventsSince({
      client: kcAdminClient,
      realm: provider.realm,
      watermark: this.adminEventsWatermark,
      maxResults: provider.adminEvents?.maxResults,
    });

    logger.info(
      `Admin events poll: ${rawCount} raw event(s), ${events.length} org-relevant event(s)`,
    );

    const applicator = new AdminEventsDeltaApplicator({
      connection: this.connection,
      provider,
      logger,
      locationKey: `keycloak-org-provider:${this.options.id}`,
      entityIndex: this.entityIndex,
      catalog: this.options.catalog,
      auth: this.options.auth,
      userTransformer: this.options.userTransformer,
      groupTransformer: this.options.groupTransformer,
      withLocations: entity =>
        withLocations(provider.baseUrl, provider.realm, entity),
    });

    for (const event of events) {
      try {
        await applicator.apply(event, kcAdminClient);
      } catch (error) {
        if (isError(error)) {
          logger.error(
            `Failed to apply admin event ${event.resourceType}-${event.operationType} (${event.resourcePath})`,
            {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
          );
        }
      }
    }

    this.adminEventsWatermark = nextWatermark;
  }

  /**
   * Periodically schedules a task to read Keycloak user and group information, parse it, and provision it to the Backstage catalog.
   * @param taskRunner - The task runner to use for scheduling tasks.
   */
  schedule(taskRunner: SchedulerServiceTaskRunner) {
    this.scheduleFn = async () => {
      const id = `${this.getProviderName()}:refresh`;
      await taskRunner.run({
        id,
        fn: async () => {
          const taskInstanceId = uuidv4();
          const logger = this.options.logger.child({
            class: KeycloakOrgEntityProvider.prototype.constructor.name,
            taskId: id,
            taskInstanceId: taskInstanceId,
          });

          try {
            await this.read({ logger, taskInstanceId });
          } catch (error) {
            this.counter.add(1, { taskInstanceId: taskInstanceId });
            if (isError(error)) {
              // Ensure that we don't log any sensitive internal data:
              logger.error('Error while syncing Keycloak users and groups', {
                // Default Error properties:
                name: error.name,
                cause: error.cause,
                message: error.message,
                stack: error.stack,
                // Additional status code if available:
                status: (error.response as { status?: string })?.status,
              });
            }
          }
        },
      });
    };
  }

  /**
   * SPIKE (RHIDP-15634): schedule Admin Events polling alongside full sync.
   */
  scheduleAdminEvents(taskRunner: SchedulerServiceTaskRunner) {
    this.adminEventsScheduleFn = async () => {
      const id = `${this.getProviderName()}:admin-events`;
      await taskRunner.run({
        id,
        fn: async () => {
          const taskInstanceId = uuidv4();
          const logger = this.options.logger.child({
            class: KeycloakOrgEntityProvider.prototype.constructor.name,
            taskId: id,
            taskInstanceId,
          });

          try {
            await this.readAdminEvents({ logger });
          } catch (error) {
            if (isError(error)) {
              logger.error('Error while polling Keycloak admin events', {
                name: error.name,
                cause: error.cause,
                message: error.message,
                stack: error.stack,
                status: (error.response as { status?: string })?.status,
              });
            }
          }
        },
      });
    };
  }
}

// Helps wrap the timing and logging behaviors
function trackProgress(logger: LoggerService) {
  let timestamp = Date.now();
  let summary: string;

  logger.info('Reading Keycloak users and groups');

  function markReadComplete(read: { users: unknown[]; groups: unknown[] }) {
    summary = `${read.users.length} Keycloak users and ${read.groups.length} Keycloak groups`;
    const readDuration = ((Date.now() - timestamp) / 1000).toFixed(1);
    timestamp = Date.now();
    logger.info(`Read ${summary} in ${readDuration} seconds. Committing...`);
    return { markCommitComplete };
  }

  function markCommitComplete() {
    const commitDuration = ((Date.now() - timestamp) / 1000).toFixed(1);
    logger.info(`Committed ${summary} in ${commitDuration} seconds.`);
  }

  return { markReadComplete };
}
