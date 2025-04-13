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
import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { rootRouteRef } from './routes';

export const morguePlugin = createPlugin({
  id: 'morgue',
  routes: {
    root: rootRouteRef,
  },
});

export const MorgueTablePage = morguePlugin.provide(
  createRoutableExtension({
    name: 'MorgueTablePage',
    component: () =>
      import('./components/MorgueTablePage').then(m => m.MorgueTablePage),
    mountPoint: rootRouteRef,
  }),
);

export const PostMortemPage = morguePlugin.provide(
  createRoutableExtension({
    name: 'PostMortemPage',
    component: () =>
      import('./components/PostMortemPage').then(m => m.PostMortemPage),
    mountPoint: rootRouteRef,
  }),
);

export const CreatePostMortemPage = morguePlugin.provide(
  createRoutableExtension({
    name: 'CreatePostMortemPage',
    component: () =>
      import('./components/CreatePostMortemPage').then(
        m => m.CreatePostMortemForm,
      ),
    mountPoint: rootRouteRef,
  }),
);
