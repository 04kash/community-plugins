/*
 * Copyright 2025 The Backstage Authors
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
import React from 'react';
import { createDevApp } from '@backstage/dev-utils';
import { morguePlugin, MorgueFullPageRouter } from '../src/plugin';
import {
  CatalogApi,
  catalogApiRef,
} from '@backstage/plugin-catalog-react';
import { CatalogEntityPage } from '@backstage/plugin-catalog';

// --- Dev App Setup ---
createDevApp()
  .registerPlugin(morguePlugin)
  .registerApi({
    api: catalogApiRef,
    deps: {},
    factory: () =>
      ({
        async getEntityByRef(ref: string) {
          if (ref === 'user:default/guest') {
            return {
              kind: 'User',
              metadata: {
                name: 'guest',
                namespace: 'default',
                description: 'Anonymous to the max',
              },
              spec: {},
            };
          }
          return undefined;
        },
      } as CatalogApi),
  })
  .addPage({
    element: <MorgueFullPageRouter />,
    title: 'FullPageRouter',
    path: '/full-page-router',
  })
  .addPage({
    path: '/catalog/:kind/:namespace/:name', // Important to support EntityRefLink
    element: <CatalogEntityPage />,
  })
  .render();
