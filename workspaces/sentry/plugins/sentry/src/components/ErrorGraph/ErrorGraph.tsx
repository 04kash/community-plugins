/*
 * Copyright 2020 The Backstage Authors
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

import { SentryIssue } from '../../api';
import { Sparklines, SparklinesBars } from 'react-sparklines';

export const ErrorGraph = ({ sentryIssue }: { sentryIssue: SentryIssue }) => {
  const data =
    '14d' in sentryIssue.stats
      ? sentryIssue.stats['14d']
      : sentryIssue.stats['24h'];

  return (
    <Sparklines data={data?.map(([, val]) => val)} svgHeight={48} margin={4}>
      <SparklinesBars />
    </Sparklines>
  );
};
