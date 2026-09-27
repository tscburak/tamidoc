import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  /**
   * Update user onboarding information and mark onboarding as completed
   */
  async updateOnboarding(
    userId: string,
    dto: UpdateOnboardingDto,
  ): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Only overwrite fields that are present (skipped = unchanged/undefined)
    if (dto.userType !== undefined) {
      user.userType = dto.userType;
    }
    if (dto.documentTypes !== undefined) {
      user.documentTypes = dto.documentTypes;
    }
    if (dto.organizationSize !== undefined) {
      user.organizationSize = dto.organizationSize;
    }
    if (dto.occupation !== undefined) {
      user.occupation = dto.occupation;
    }

    // Mark onboarding as completed
    user.onboardingCompleted = true;
    user.onboardingCompletedAt = new Date();

    await user.save();
    return user;
  }
}
