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
import { TemplateExample } from '@backstage/plugin-scaffolder-node';
import yaml from 'yaml';

export const examples: TemplateExample[] = [
  {
    description: 'Creates a namespace in the Kubernetes cluster using url.',
    example: yaml.stringify({
      steps: [
        {
          id: 'create-kubernetes-namespace',
          action: 'kubernetes:create-namespace',
          name: 'Create Kubernetes namespace',
          input: {
            namespace: 'example-namespace',
            token: 'YOUR_AUTH_TOKEN',
            url: 'https://api.foo.example.com:6443',
          },
        },
      ],
    }),
  },
  {
    description:
      'Creates a namespace in the Kubernetes cluster using clusterRef.',
    example: yaml.stringify({
      steps: [
        {
          id: 'create-kubernetes-namespace',
          action: 'kubernetes:create-namespace',
          name: 'Create Kubernetes namespace',
          input: {
            namespace: 'example-namespace',
            token: 'YOUR_AUTH_TOKEN',
            clusterRef: 'resource:default/kubernetes-cluster-entity',
          },
        },
      ],
    }),
  },
  {
    description: 'Creates a namespace in the Kubernetes cluster with labels.',
    example: yaml.stringify({
      steps: [
        {
          id: 'create-kubernetes-namespace',
          action: 'kubernetes:create-namespace',
          name: 'Create Kubernetes namespace',
          input: {
            namespace: 'my-namespace',
            token: 'YOUR_AUTH_TOKEN',
            url: 'https://api.foo.example.com:6443',
            labels: 'kubernetes.io/type=namespace;app.io/managed-by=org',
          },
        },
      ],
    }),
  },
];
