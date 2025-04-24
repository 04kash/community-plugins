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
import React, { useState } from 'react';
import { Content, Header, Link, Page } from '@backstage/core-components';
import {
  Box,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
} from '@material-ui/core';
import { Pagination } from '@material-ui/lab';

const renderChips = (items: string[]) => {
  return items.map((item, index) => (
    <Chip key={index} label={item} style={{ margin: '2px' }} />
  ));
};

// Example data
const generateTestData = (num: number) => {
  return Array.from({ length: num }, (_, index) => ({
    title: `Incident ${index + 1}`,
    participants: [`team-${index + 1}`, `user-${index + 2}`], // Multiple participants
    impactedEntities: [`service-${index + 1}`, `service-${index + 2}`], // Multiple impacted entities
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
    lessons_learned: `
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

const ITEMS_PER_PAGE = 6; // Number of reports per page

export const MorgueTablePage = () => {
  const [page, setPage] = useState(1);

  // Generate the full list of incidents
  const allIncidents = generateTestData(10);

  // Slice the data based on the current page and the number of items per page
  const pagedIncidents = allIncidents.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const handlePageChange = (
    _event: React.ChangeEvent<unknown>,
    value: number,
  ) => {
    setPage(value);
  };

  return (
    <Page themeId="tool">
      <Header
        title="Morgue"
        subtitle="Post-mortem reports across the organization"
      />
      <Content>
        <Grid container spacing={2} alignItems="flex-start">
          <Grid item xs={12}>
            <Box display="flex" justifyContent="flex-end" mb={2}>
              <Button variant="contained" color="primary" to="/">
                New Post-Mortem
              </Button>
            </Box>
          </Grid>

          {/* Cards take up the remaining space */}
          <Grid container spacing={3}>
            {pagedIncidents.map((postMortem, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" component="h2">
                      <Link
                        to={`/report/${postMortem.title}`}
                        style={{ textDecoration: 'none' }}
                      >
                        {postMortem.title}
                      </Link>
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {`Start Time: ${new Date(
                        postMortem.timeline[0].time,
                      ).toLocaleString()}`}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {`End Time: ${new Date(
                        postMortem.timeline[
                          postMortem.timeline.length - 1
                        ].time,
                      ).toLocaleString()}`}
                    </Typography>
                    <Box display="flex" flexWrap="wrap" mt={1}>
                      <Typography variant="body2" component="div">
                        Participants:
                        {renderChips(postMortem.participants)}
                      </Typography>
                    </Box>
                    <Box display="flex" flexWrap="wrap" mt={1}>
                      <Typography variant="body2" component="div">
                        Impacted Entities:
                        {renderChips(postMortem.impactedEntities)}
                      </Typography>
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button size="small" color="primary">
                      View Details
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Pagination */}
          <Grid item xs={12} style={{ marginTop: '20px' }}>
            <Grid container justifyContent="center">
              <Pagination
                count={Math.ceil(allIncidents.length / ITEMS_PER_PAGE)}
                page={page}
                onChange={handlePageChange}
                color="primary"
              />
            </Grid>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
