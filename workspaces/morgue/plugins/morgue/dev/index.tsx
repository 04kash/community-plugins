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
import {
  morguePlugin,
  MorgueTablePage,
  PostMortemPage,
  CreatePostMortemPage,
} from '../src/plugin';
import { TestApiProvider } from '@backstage/test-utils';
import {
  MockSearchApi,
  searchApiRef,
  SearchContextProvider,
} from '@backstage/plugin-search-react';

const examplePostMortem = {
  title: 'Outage in User Authentication Service',
  participants: ['user:default/jdoe', 'group:default/infra-team'],
  impacted_entities: [
    'component:default/auth-service',
    'system:default/user-platform',
  ],
  description: `
## What Happened

This incident was triggered during our routine Friday deployment window. The change was meant to improve token refresh reliability by switching from our legacy in-memory session store to a distributed Redis-based solution. While the implementation passed unit tests and code review, it lacked integration testing in a production-like environment.

Shortly after deployment, several engineers noticed spikes in error logs related to \`JWTSignatureMismatchError\`, but the correlation to the Redis rollout wasn’t immediately obvious. The team initially suspected an issue with a recent third-party library upgrade.

## Why It Matters

This wasn't just a technical failure — it highlighted a breakdown in cross-team communication and assumptions around responsibility for auth-related changes. The identity platform team was unaware that a downstream consumer (our legacy admin dashboard) still relied on the old session format.

## Context and Contributing Factors

- The feature toggle system failed to roll back automatically due to a misconfigured fail-safe condition.
- Our documentation for authentication dependencies was outdated and incomplete.
- A new team member ran the deployment but didn’t know the full rollback procedure for session-related changes.
- Monitoring dashboards showed healthy Redis metrics, misleading us into thinking the issue was unrelated.

---

We view this as a valuable learning moment for tightening feedback loops between teams and improving both technical and procedural safeguards.
`,

  detection: `
# Hi
The issue was first detected via synthetic monitoring alerts on sign-in failure rates.
  `,
  response: `
Engineers rolled back the deployment and restarted the affected pods.
  `,
  resolution: `
The rollback stabilized the service, and sign-in functionality was restored.
  `,
  prevention: `
We will implement pre-deployment traffic shadowing and automated rollback triggers based on health checks.
  `,
  lessons_learned: `
- Automated rollback criteria are crucial
- We need better alert thresholds on auth-related metrics
- Internal runbooks were outdated
  `,
  timeline: [
    {
      time: '2025-04-10T08:15:00Z',
      description: 'Incident detected by monitoring system',
    },
    {
      time: '2025-04-10T08:20:00Z',
      description: 'Engineering team paged',
    },
    {
      time: '2025-04-10T08:20:00Z',
      description: 'Engineering team paged',
    },
    {
      time: '2025-04-10T08:20:00Z',
      description: 'Engineering team paged',
    },
    {
      time: '2025-04-10T08:55:00Z',
      description: 'Service recovery confirmed',
    },
  ],
};

createDevApp()
  .registerPlugin(morguePlugin)
  .addPage({
    element: (
      <TestApiProvider apis={[[searchApiRef, new MockSearchApi()]]}>
        <SearchContextProvider>
          <MorgueTablePage />
        </SearchContextProvider>
      </TestApiProvider>
    ),
    title: 'Morgue',
    path: '/morgue',
  })
  .addPage({
    element: (
      <TestApiProvider apis={[[searchApiRef, new MockSearchApi()]]}>
        <SearchContextProvider>
          <PostMortemPage postMortem={examplePostMortem} />
        </SearchContextProvider>
      </TestApiProvider>
    ),
    title: 'Single Post Mortem Page',
    path: '/post-mortem',
  })
  .addPage({
    element: (
      <TestApiProvider apis={[[searchApiRef, new MockSearchApi()]]}>
        <SearchContextProvider>
          <CreatePostMortemPage />
        </SearchContextProvider>
      </TestApiProvider>
    ),
    title: 'Create Post Mortem Page',
    path: '/create-post-mortem',
  })
  .render();
