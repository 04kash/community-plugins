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

import React, { ReactNode, useState } from 'react';
import {
  Content,
  Header,
  InfoCard,
  MarkdownContent,
  Page,
} from '@backstage/core-components';
import {
  Box,
  Typography,
  Grid,
  Collapse,
  IconButton,
  Divider,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
} from '@material-ui/lab';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import StopIcon from '@material-ui/icons/Stop';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';

type TimelineEntry = {
  time: string; // ISO timestamp
  description: string;
};

type PostMortem = {
  id: string;
  title: string;
  participants?: string[];
  impactedEntities?: string[];
  description: string;
  detection: string;
  response: string;
  resolution: string;
  prevention: string;
  lessonsLearned: string;
  timeline?: TimelineEntry[];
};

type CollapsibleCardProps = {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
};

const CollapsibleCard = ({
  title,
  children,
  defaultExpanded = false,
}: CollapsibleCardProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box mb={3}>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Typography variant="h3">{title}</Typography>
        <IconButton size="small" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      <Divider style={{ margin: '0.5rem 0' }} />
      <Collapse in={expanded}>
        <Box mt={1}>{children}</Box>
      </Collapse>
    </Box>
  );
};

type PostMortemPageProps = {
  postMortem: PostMortem;
};

export const PostMortemPage = ({ postMortem }: PostMortemPageProps) => {
  const {
    title,
    participants = [],
    impactedEntities = [],
    description,
    detection,
    response,
    resolution,
    prevention,
    lessonsLearned,
    timeline = [],
  } = postMortem;

  return (
    <Page themeId="tool">
      <Header title={title} />
      <Content>
        <Box padding={3}>
          <Grid container spacing={4}>
            {/* Left Side: Main Content */}
            <Grid item xs={12} md={8}>
              <CollapsibleCard title="Description" defaultExpanded>
                <MarkdownContent content={description} />
              </CollapsibleCard>

              <CollapsibleCard title="Detection">
                <MarkdownContent content={detection} />
              </CollapsibleCard>

              <CollapsibleCard title="Response & Resolution">
                <MarkdownContent content={`${response}\n\n${resolution}`} />
              </CollapsibleCard>

              <CollapsibleCard title="Prevention Measures">
                <MarkdownContent content={prevention} />
              </CollapsibleCard>

              <CollapsibleCard title="Lessons Learned">
                <MarkdownContent content={lessonsLearned} />
              </CollapsibleCard>
            </Grid>

            {/* Right Side: Timeline */}
            <Grid item xs={12} md={4}>
              <Box position="sticky" top={24}>
                <Box mb={3}>
                  <InfoCard title="Incident Details">
                    <Box mb={2}>
                      <Typography variant="h6">Participants</Typography>
                      <Typography variant="body1">
                        {participants.length > 0
                          ? participants.join(', ')
                          : 'None'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="h6">Impacted Entities</Typography>
                      <Typography variant="body1">
                        {impactedEntities.length > 0
                          ? impactedEntities.join(', ')
                          : 'None'}
                      </Typography>
                    </Box>
                  </InfoCard>
                </Box>

                <InfoCard title="Incident Timeline">
                  <Timeline align="alternate">
                    {timeline.map((entry: TimelineEntry, index) => {
                      const isFirst = index === 0;
                      const isLast = index === timeline.length - 1;

                      let dotColor:
                        | 'inherit'
                        | 'primary'
                        | 'secondary'
                        | 'grey'
                        | undefined = 'primary';
                      let DotIcon = FiberManualRecordIcon;
                      let variant: 'default' | 'outlined' | undefined =
                        'default';

                      if (isFirst) {
                        dotColor = 'secondary';
                        DotIcon = PlayArrowIcon;
                      } else if (isLast) {
                        dotColor = 'secondary';
                        DotIcon = StopIcon;
                      } else {
                        variant = 'outlined';
                      }

                      return (
                        <TimelineItem key={index}>
                          <TimelineSeparator>
                            <TimelineDot color={dotColor} variant={variant}>
                              <DotIcon />
                            </TimelineDot>
                            {!isLast && <TimelineConnector />}
                          </TimelineSeparator>
                          <TimelineContent>
                            <Typography variant="body2" color="textSecondary">
                              {new Date(entry.time).toLocaleString()}
                            </Typography>
                            <Typography variant="subtitle1">
                              {entry.description}
                            </Typography>
                          </TimelineContent>
                        </TimelineItem>
                      );
                    })}
                  </Timeline>
                </InfoCard>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Content>
    </Page>
  );
};
