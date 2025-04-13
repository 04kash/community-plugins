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
import {
  Link,
  TableColumn,
  Table,
  Page,
  Header,
  Content,
} from '@backstage/core-components';
import { Box, Button, Chip, Grid } from '@material-ui/core';
import { SearchFilter } from '@backstage/plugin-search-react';

const renderChips = (items: string[]) => {
  return items.map((item, index) => (
    <Chip key={index} label={item} style={{ margin: '2px' }} />
  ));
};

// Example data
const generateTestData = (num: number) => {
  return Array.from({ length: num }, (_, index) => ({
    title: `Incident ${index + 1}`,
    startTime: '2025-04-01T12:00:00Z',
    endTime: '2025-04-01T14:00:00Z',
    // Make participants and impactedEntities arrays of strings
    participants: [`team-${index + 1}`, `user-${index + 2}`], // Multiple participants
    impactedEntities: [`service-${index + 1}`, `service-${index + 2}`], // Multiple impacted entities
  }));
};

const columns: TableColumn[] = [
  {
    title: 'Title',
    field: 'title',
    render: (rowData: any) => (
      <Link to={`/report/${rowData.title}`} style={{ textDecoration: 'none' }}>
        {rowData.title}
      </Link>
    ),
  },
  { title: 'Start Time', field: 'startTime', type: 'datetime' },
  { title: 'End Time', field: 'endTime', type: 'datetime' },
  {
    title: 'Participants',
    field: 'participants',
    render: (rowData: any) => renderChips(rowData.participants),
  },
  {
    title: 'Impacted Entities',
    field: 'impactedEntities',
    render: (rowData: any) => renderChips(rowData.impactedEntities),
  },
];

export const MorgueTablePage = () => {
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
              <Button variant="contained" color="primary">
                New Post-Mortem
              </Button>
            </Box>
          </Grid>
          {/* Search Filter takes up a fixed width (e.g., 2/12 of the width) */}
          <Grid item xs={12} md={2}>
            <SearchFilter.Select
              label="Title"
              name="select_filter"
              values={['value1', 'value2']}
            />
            <SearchFilter.Select
              label="Participants"
              name="select_filter"
              values={['value1', 'value2']}
            />
            <SearchFilter.Select
              label="Impacted Entities"
              name="select_filter"
              values={['value1', 'value2']}
            />
          </Grid>

          {/* Table takes up the remaining space */}
          <Grid item xs={12} md={10}>
            <Table
              options={{ paging: true, padding: 'dense' }}
              data={generateTestData(10)}
              columns={columns}
              title="Recorded Post-Mortems"
            />
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};
