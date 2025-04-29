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

import { stringifyEntityRef } from '@backstage/catalog-model';

export const generateTestData = (num: number) => {
  return Array.from({ length: num }, (_, index) => ({
    id: `${index + 1}`,
    title: `Incident ${index + 1}`,
    participants: [
      stringifyEntityRef({ kind: 'Group', namespace: 'default', name: `team-${index + 1}` }),
      stringifyEntityRef({ kind: 'User', namespace: 'default', name: `user-${index + 2}` }),
    ],
    impactedEntities: [
      stringifyEntityRef({ kind: 'System', namespace: 'default', name: `system-${index + 1}` }),
      stringifyEntityRef({ kind: 'Component', namespace: 'default', name: `service-${index + 2}` }),
    ],
    description: `## What Happened
  
  This incident occurred during a routine update. There was an issue with the authentication service causing multiple users to be unable to log in. After investigation, it was found that the authentication token validation was incorrectly implemented.
  
  ## Why It Matters
  
  This led to a major disruption in the user experience, and some of our key services could not be accessed by users. We need to ensure better communication and a thorough validation process in the future.
  
  ## Context and Contributing Factors
  
  - The validation logic was not tested properly before deployment.
  - There were no automated rollback mechanisms for authentication-related services.
  - Key teams were unaware of recent changes made to the authentication service.
  - Monitoring dashboards did not reflect the severity of the issue.
  
  `,
    detection: `
  The issue was detected via alert monitoring on failed login attempts, followed by manual investigation by the engineering team.
  `,
    response: `
  The engineering team rolled back the deployment, restoring functionality for users.
  `,
    resolution: `
  The rollback restored service, and users were able to log in again.
  `,
    prevention: `
  We are implementing better testing and validation processes for critical services, as well as creating a more robust monitoring system for authentication failures.
  `,
    lessonsLearned: `
  - Importance of proper testing before deployment.
  - Need for better communication between teams.
  - Clearer documentation for rollback procedures.
  `,
    timeline: [
      {
        time: '2025-04-01T12:05:00Z',
        description: 'Incident detected by monitoring system',
      },
      {
        time: '2025-04-01T12:15:00Z',
        description: 'Engineering team paged',
      },
      {
        time: '2025-04-01T12:30:00Z',
        description: 'Issue identified as a broken authentication token',
      },
      {
        time: '2025-04-01T13:00:00Z',
        description: 'Rollback completed and service restored',
      },
    ],
  }));
};

