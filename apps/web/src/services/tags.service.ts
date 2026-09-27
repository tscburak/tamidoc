import apiClient from '../lib/api';
import type { Tag } from '../types/access';

export interface CreateTagDto {
  name: string;
  color?: string;
}

export type UpdateTagDto = Partial<CreateTagDto>;

class TagsService {
  private base(orgId: string) {
    return `/organizations/${orgId}/tags`;
  }

  async findAll(organizationId: string): Promise<Tag[]> {
    const response = await apiClient.get<{ tags: Tag[] }>(this.base(organizationId));
    return response.data.tags;
  }

  async create(organizationId: string, dto: CreateTagDto): Promise<Tag> {
    const response = await apiClient.post<Tag>(this.base(organizationId), dto);
    return response.data;
  }

  async update(organizationId: string, id: string, dto: UpdateTagDto): Promise<Tag> {
    const response = await apiClient.put<Tag>(`${this.base(organizationId)}/${id}`, dto);
    return response.data;
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await apiClient.delete(`${this.base(organizationId)}/${id}`);
  }
}

export const tagsService = new TagsService();
