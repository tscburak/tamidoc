import {
  Controller,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import type { IRequestWithUser } from '../auth/interfaces/request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { User } from './schemas/user.schema';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put('me/onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Save onboarding info and mark onboarding complete',
  })
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: 'Onboarding updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateOnboarding(
    @Body() dto: UpdateOnboardingDto,
    @Request() req: IRequestWithUser,
  ) {
    const user = await this.usersService.updateOnboarding(req.user.userId, dto);
    const { passwordHash, ...userResponse } = user.toObject();
    return { user: userResponse };
  }
}
