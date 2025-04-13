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
import {
  Box,
  Button,
  Grid,
  Stepper,
  Step,
  StepLabel,
  Typography,
  StepContent,
  TextField,
  IconButton,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Content, Header, Page } from '@backstage/core-components';
import MDEditor from '@uiw/react-md-editor';
import Add from '@material-ui/icons/Add';
import Delete from '@material-ui/icons/Delete';

const useStyles = makeStyles(theme => ({
  formSection: {
    padding: theme.spacing(3),
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
    marginBottom: theme.spacing(3),
  },
  stepButtons: {
    marginTop: theme.spacing(2),
    display: 'flex',
    gap: theme.spacing(1),
  },
  timelineCard: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
  },
  timelineGrid: {
    alignItems: 'center',
  },
  markdownEditorWrapper: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
  },
}));

const MarkdownField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v?: string) => void;
}) => (
  <Box mt={3} mb={3}>
    <Typography variant="h6" gutterBottom>
      {label}
    </Typography>
    <Box sx={{ padding: 2, borderRadius: 2, boxShadow: 1 }}>
      <MDEditor value={value} onChange={onChange} height={200} />
    </Box>
  </Box>
);

export const CreatePostMortemForm = () => {
  const classes = useStyles();
  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState({
    title: '',
    participants: '',
    impacted_entities: '',
    description: '',
    detection: '',
    response: '',
    resolution: '',
    prevention: '',
    lessons_learned: '',
    timeline: [
      { time: '', description: '' },
      { time: '', description: '' },
    ],
  });

  const handleChange = (field: string) => (e: any) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleMarkdownChange = (field: string) => (value?: string) =>
    setForm(prev => ({ ...prev, [field]: value || '' }));

  const handleTimelineChange =
    (index: number, key: 'time' | 'description') => (e: any) => {
      const updated = [...form.timeline];
      updated[index][key] = e.target.value;
      setForm(prev => ({ ...prev, timeline: updated }));
    };

  const addTimelineItem = () =>
    setForm(prev => ({
      ...prev,
      timeline: [...prev.timeline, { time: '', description: '' }],
    }));

  const removeTimelineItem = (index: number) =>
    setForm(prev => ({
      ...prev,
      timeline: prev.timeline.filter((_, i) => i !== index),
    }));

  const handleSubmit = () => {
    // Submit to backend
  };

  const handleNext = () => {
    setActiveStep(prev => prev + 1);
  };

  const handleBack = () => setActiveStep(prev => prev - 1);

  return (
    <Page themeId="tool">
      <Header title="Create Post-Mortem" />
      <Content>
        <Box>
          <Stepper activeStep={activeStep} orientation="vertical">
            {/* Step 1: Overview */}
            <Step>
              <StepLabel>Incident Overview</StepLabel>
              <StepContent>
                <Box className={classes.formSection}>
                  <TextField
                    label="Title"
                    fullWidth
                    variant="outlined"
                    value={form.title}
                    onChange={handleChange('title')}
                    margin="normal"
                  />
                  <TextField
                    label="Participants (comma-separated)"
                    fullWidth
                    variant="outlined"
                    value={form.participants}
                    onChange={handleChange('participants')}
                    margin="normal"
                  />
                  <TextField
                    label="Impacted Entities (comma-separated)"
                    fullWidth
                    variant="outlined"
                    value={form.impacted_entities}
                    onChange={handleChange('impacted_entities')}
                    margin="normal"
                  />
                </Box>
                <Box className={classes.stepButtons}>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={handleNext}
                  >
                    Next
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* Step 2: Narrative */}
            <Step>
              <StepLabel>Incident Narrative</StepLabel>
              <StepContent>
                <Box className={classes.formSection}>
                  <MarkdownField
                    label="Description"
                    value={form.description}
                    onChange={handleMarkdownChange('description')}
                  />
                  <MarkdownField
                    label="Detection"
                    value={form.detection}
                    onChange={handleMarkdownChange('detection')}
                  />
                </Box>
                <Box className={classes.stepButtons}>
                  <Button onClick={handleBack}>Back</Button>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={handleNext}
                  >
                    Next
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* Step 3: Impact and Resolution */}
            <Step>
              <StepLabel>Impact and Resolution</StepLabel>
              <StepContent>
                <Box className={classes.formSection}>
                  <MarkdownField
                    label="Response"
                    value={form.response}
                    onChange={handleMarkdownChange('response')}
                  />
                  <MarkdownField
                    label="Resolution"
                    value={form.resolution}
                    onChange={handleMarkdownChange('resolution')}
                  />
                  <MarkdownField
                    label="Prevention"
                    value={form.prevention}
                    onChange={handleMarkdownChange('prevention')}
                  />
                </Box>
                <Box className={classes.stepButtons}>
                  <Button onClick={handleBack}>Back</Button>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={handleNext}
                  >
                    Next
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* Step 4: Lessons Learned */}
            <Step>
              <StepLabel>Lessons Learned</StepLabel>
              <StepContent>
                <Box className={classes.formSection}>
                  <MarkdownField
                    label="Lessons Learned"
                    value={form.lessons_learned}
                    onChange={handleMarkdownChange('lessons_learned')}
                  />
                </Box>
                <Box className={classes.stepButtons}>
                  <Button onClick={handleBack}>Back</Button>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={handleNext}
                  >
                    Next
                  </Button>
                </Box>
              </StepContent>
            </Step>

            {/* Step 5: Timeline */}
            <Step>
              <StepLabel>Incident Timeline</StepLabel>
              <StepContent>
                <Box className={classes.formSection}>
                  {form.timeline.map((item, index) => (
                    <Box key={index} className={classes.timelineCard}>
                      <Grid
                        container
                        spacing={2}
                        className={classes.timelineGrid}
                        alignItems="flex-start"
                      >
                        <Grid item xs={12} sm={5}>
                          <TextField
                            type="datetime-local"
                            label="Time"
                            value={item.time}
                            onChange={handleTimelineChange(index, 'time')}
                            InputLabelProps={{ shrink: true }}
                            fullWidth
                            variant="outlined"
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            label="What happened"
                            value={item.description}
                            onChange={handleTimelineChange(
                              index,
                              'description',
                            )}
                            fullWidth
                            variant="outlined"
                            multiline
                          />
                        </Grid>
                        <Grid item xs={12} sm={1}>
                          {index >= 2 && (
                            <IconButton
                              onClick={() => removeTimelineItem(index)}
                              aria-label="Delete timeline entry"
                            >
                              <Delete />
                            </IconButton>
                          )}
                        </Grid>
                      </Grid>
                    </Box>
                  ))}
                  <Button
                    onClick={addTimelineItem}
                    startIcon={<Add />}
                    color="primary"
                    variant="outlined"
                  >
                    Add Entry
                  </Button>
                </Box>
                <Box className={classes.stepButtons}>
                  <Button onClick={handleBack}>Back</Button>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={handleSubmit}
                  >
                    Submit Post-Mortem
                  </Button>
                </Box>
              </StepContent>
            </Step>
          </Stepper>
        </Box>
      </Content>
    </Page>
  );
};
