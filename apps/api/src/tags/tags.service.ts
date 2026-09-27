import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tag } from './schemas/tag.schema';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(@InjectModel(Tag.name) private tagModel: Model<Tag>) {}

  async findAll(organizationId: string): Promise<Tag[]> {
    return this.tagModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ name: 1 })
      .exec();
  }

  async create(organizationId: string, dto: CreateTagDto): Promise<Tag> {
    const name = dto.name.trim();
    // Case-insensitive uniqueness within the org.
    const existing = await this.tagModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      name: {
        $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      },
    });
    if (existing) {
      throw new BadRequestException('A tag with this name already exists');
    }
    return this.tagModel.create({
      organizationId: new Types.ObjectId(organizationId),
      name,
      color: dto.color,
    });
  }

  async update(
    organizationId: string,
    tagId: string,
    dto: UpdateTagDto,
  ): Promise<Tag> {
    const tag = await this.tagModel.findOne({
      _id: new Types.ObjectId(tagId),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== tag.name) {
        const clash = await this.tagModel.findOne({
          organizationId: new Types.ObjectId(organizationId),
          name: {
            $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            $options: 'i',
          },
        });
        if (clash) {
          throw new BadRequestException('A tag with this name already exists');
        }
        tag.name = name;
      }
    }
    if (dto.color !== undefined) tag.color = dto.color;
    return tag.save();
  }

  async remove(organizationId: string, tagId: string): Promise<void> {
    const result = await this.tagModel.deleteOne({
      _id: new Types.ObjectId(tagId),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Tag not found');
    }
  }
}
