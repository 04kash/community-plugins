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
import AccessTimeIcon from '@material-ui/icons/AccessTime';
import GroupIcon from '@material-ui/icons/Group';
import StorageIcon from '@material-ui/icons/Storage';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import { createPostMortemRouteRef, viewPostMortemRouteRef } from '../../routes';
import { useRouteRef } from '@backstage/core-plugin-api';
import { generateTestData } from '../../utils/mockData';

const renderChips = (items: string[]) => {
  const displayed = items.slice(0, 3);
  const hidden = items.length - displayed.length;
  return (
    <>
      {displayed.map((item, index) => (
        <Chip
          key={index}
          label={item}
          size="small"
          style={{ marginRight: 4, marginBottom: 2 }}
        />
      ))}
      {hidden > 0 && (
        <Chip
          label={`+${hidden} more`}
          size="small"
          style={{ marginRight: 4, marginBottom: 2 }}
        />
      )}
    </>
  );
};

// TODO: allow users to be able to configure this option instead of hard coding
const ITEMS_PER_PAGE = 9;

export const MorgueTablePage = () => {
  const [page, setPage] = useState(1);

  const createPostMortemLink = useRouteRef(createPostMortemRouteRef);
  const viewPostMortemLink = useRouteRef(viewPostMortemRouteRef);
  const postMortems = generateTestData(10);

  const pagedPostMortems = postMortems.slice(
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
              <Link to={createPostMortemLink()}>
                <Button variant="contained" color="primary">
                  New Post-Mortem
                </Button>
              </Link>
            </Box>
          </Grid>

          <Grid container spacing={3}>
            {pagedPostMortems.map((postMortem, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  elevation={3}
                  style={{
                    transition: 'transform 0.2s ease-in-out',
                    cursor: 'pointer',
                    borderRadius: '8px',
                  }}
                  onMouseOver={e =>
                    (e.currentTarget.style.transform = 'scale(1.02)')
                  }
                  onMouseOut={e =>
                    (e.currentTarget.style.transform = 'scale(1)')
                  }
                >
                  <CardContent style={{ paddingBottom: 8 }}>
                    <Typography
                      variant="h6"
                      component="h2"
                      style={{ fontWeight: 'bold' }}
                      gutterBottom
                    >
                      <Link
                        to={viewPostMortemLink({ id: postMortem.id })}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        {postMortem.title}
                      </Link>
                    </Typography>

                    <Box display="flex" alignItems="center" mb={0.5}>
                      <AccessTimeIcon
                        fontSize="small"
                        style={{ marginRight: 4 }}
                      />
                      <Typography variant="caption" color="textSecondary">
                        {`Start: ${new Date(
                          postMortem.timeline[0].time,
                        ).toLocaleString()}`}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" mb={0.5}>
                      <AccessTimeIcon
                        fontSize="small"
                        style={{ marginRight: 4 }}
                      />
                      <Typography variant="caption" color="textSecondary">
                        {`End: ${new Date(
                          postMortem.timeline[
                            postMortem.timeline.length - 1
                          ].time,
                        ).toLocaleString()}`}
                      </Typography>
                    </Box>

                    <Box
                      display="flex"
                      alignItems="center"
                      flexWrap="wrap"
                      mb={0.5}
                      mt={1}
                    >
                      <GroupIcon fontSize="small" style={{ marginRight: 4 }} />
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        style={{ fontWeight: 'bold' }}
                      >
                        Participants:
                      </Typography>
                      {renderChips(postMortem.participants)}
                    </Box>

                    <Box
                      display="flex"
                      alignItems="center"
                      flexWrap="wrap"
                      mb={0.5}
                    >
                      <StorageIcon
                        fontSize="small"
                        style={{ marginRight: 4 }}
                      />
                      <Typography
                        variant="caption"
                        color="textSecondary"
                        style={{ fontWeight: 'bold' }}
                      >
                        Impacted Entities:
                      </Typography>
                      {renderChips(postMortem.impactedEntities)}
                    </Box>
                  </CardContent>

                  <CardActions style={{ paddingTop: 0 }}>
                    <Link
                      to={viewPostMortemLink({ id: postMortem.id })}
                      style={{ textDecoration: 'none' }}
                    >
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ArrowForwardIcon />}
                      >
                        View
                      </Button>
                    </Link>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Grid item xs={12} style={{ marginTop: '20px' }}>
            <Grid container justifyContent="center">
              <Pagination
                count={Math.ceil(postMortems.length / ITEMS_PER_PAGE)}
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
