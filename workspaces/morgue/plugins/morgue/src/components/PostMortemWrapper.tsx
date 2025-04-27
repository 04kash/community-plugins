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

import React, { useEffect, useState } from 'react';
import { PostMortemPage } from './PostMortemPage';
import { generateTestData } from '../utils/mockData'; // or wherever you generate data
import { useRouteRefParams } from '@backstage/core-plugin-api';
import { viewPostMortemRouteRef } from '../routes';

export const PostMortemWrapper = () => {
  const { id } = useRouteRefParams(viewPostMortemRouteRef);
  const [postMortem, setPostMortem] = useState<any | null>(null);

  useEffect(() => {
    const data = generateTestData(10).find(pm => pm.id === id);
    setPostMortem(data);
  }, [id]);

  // TODO: implement a custom error page for this
  if (!postMortem) return <div>Post-mortem not found</div>;

  return <PostMortemPage postMortem={postMortem} />;
};
