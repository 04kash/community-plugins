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

import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import {
  useEntity,
  MissingAnnotationEmptyState,
} from '@backstage/plugin-catalog-react';
import { SonarQubeCard } from '../SonarQubeCard';
import {
  isSonarQubeAvailable,
  SONARQUBE_PROJECT_KEY_ANNOTATION,
} from '@backstage-community/plugin-sonarqube-react';
import { useTranslationRef } from '@backstage/frontend-plugin-api';
import { sonarqubeTranslationRef } from '../../translation';

/** @public */
export type SonarQubeContentPageProps = {
  title?: string;
  supportTitle?: string;
  missingAnnotationReadMoreUrl?: string;
};

export const SonarQubeContentPage = (props: SonarQubeContentPageProps) => {
  const { entity } = useEntity();
  const { title, supportTitle, missingAnnotationReadMoreUrl } = props;
  const { t } = useTranslationRef(sonarqubeTranslationRef);

  return isSonarQubeAvailable(entity) ? (
    <Content>
      <ContentHeader title={title ?? t('title')}>
        {supportTitle && <SupportButton>{supportTitle}</SupportButton>}
      </ContentHeader>
      <SonarQubeCard
        missingAnnotationReadMoreUrl={missingAnnotationReadMoreUrl}
      />
    </Content>
  ) : (
    <MissingAnnotationEmptyState
      annotation={SONARQUBE_PROJECT_KEY_ANNOTATION}
      readMoreUrl={missingAnnotationReadMoreUrl}
    />
  );
};
