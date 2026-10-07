import { config } from '@/config';
import { createHttpApi } from './http';
import { createMockApi } from './mock/mockApi';
import type { Api } from './types';

export const api: Api = config.apiMode === 'mock' ? createMockApi() : createHttpApi();
