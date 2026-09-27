import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization } from './schemas/organization.schema';
import { User } from '../users/schemas/user.schema';
import { Member } from '../members/schemas/member.schema';
import { PermissionsService } from '../access-control/permissions.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuthService } from '../auth/auth.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private organizationModel: Model<Organization>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Member.name) private memberModel: Model<Member>,
    private authService: AuthService,
    private storageService: StorageService,
    private permissionsService: PermissionsService,
  ) {}

  /**
   * Create a new organization
   * Generates a unique slug from the name
   * Users can create multiple organizations (owned via createdBy)
   * Sets the new org as active and re-mints tokens
   */
  async createOrganization(
    dto: CreateOrganizationDto,
    userId: string,
  ): Promise<{
    organization: Organization;
    user: User;
    tokens: { accessToken: string; refreshToken: string; expiresIn: number };
  }> {
    // Find user
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate unique slug
    const baseSlug = dto.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
    let slug = baseSlug;
    let counter = 1;

    // Keep incrementing until we find a unique slug
    while (await this.organizationModel.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create organization
    const organization = await this.organizationModel.create({
      name: dto.name,
      slug,
      description: dto.description,
      website: dto.website,
      industry: dto.industry,
      size: dto.size,
      plan: 'free',
      createdBy: userId,
      settings: {
        branding: {
          primaryColor: dto.brandColor || '#C65D2E',
          accentColor: dto.accentColor || '#2D6A4F',
          font: dto.font || 'Inter',
        },
      },
    });

    // Seed the three system roles (owner/admin/member) for the new org.
    const roles = await this.permissionsService.seedSystemRoles(
      organization._id.toString(),
    );
    const ownerRole = roles.find((r) => r.systemKey === 'owner');
    const memberRole = roles.find((r) => r.systemKey === 'member');

    // Create the creator's membership as the organization Owner.
    if (ownerRole) {
      await this.memberModel.create({
        organizationId: organization._id,
        userId: user._id,
        roleIds: [ownerRole._id],
        status: 'active',
        joinedAt: new Date(),
      });
    }
    if (memberRole) {
      organization.settings = organization.settings || ({} as any);
      organization.settings.defaultRoleId = memberRole._id.toString();
    }

    // Set the new org as active
    user.organizationId = organization._id;
    await user.save();
    await organization.save();

    // Re-mint tokens with the new active org
    const tokens = await this.authService.generateTokens(user);

    return { organization, user, tokens };
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(organizationId: string): Promise<Organization> {
    const organization = await this.organizationModel.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  /**
   * Get organization by slug
   */
  async getOrganizationBySlug(slug: string): Promise<Organization> {
    const organization = await this.organizationModel.findOne({ slug });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    return organization;
  }

  /**
   * Get organizations the user belongs to — those they created plus any they
   * joined as a member (via direct add or accepted invite).
   */
  async getMyOrganizations(userId: string): Promise<Organization[]> {
    // Query with the raw userId string; Mongoose casts to the schema's ObjectId
    // type for both Member.userId and Organization.createdBy.
    const memberships = await this.memberModel
      .find({ userId })
      .distinct('organizationId');
    const ids = new Set<string>(memberships.map((id) => String(id)));

    const owned = await this.organizationModel
      .find({ createdBy: userId })
      .select('_id')
      .lean();
    owned.forEach((o) => ids.add(String(o._id)));

    if (ids.size === 0) {
      return [];
    }
    return this.organizationModel
      .find({ _id: { $in: [...ids] } })
      .sort({ createdAt: 1 });
  }

  /**
   * Update organization
   * Permission (organization:update) is enforced by the PermissionsGuard.
   */
  async updateOrganization(
    organizationId: string,
    userId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    void userId;
    const organization = await this.organizationModel.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Update fields if provided
    if (dto.name) {
      organization.name = dto.name;
    }
    if (dto.description !== undefined) {
      organization.description = dto.description;
    }
    if (dto.website !== undefined) {
      organization.website = dto.website;
    }
    if (dto.industry !== undefined) {
      organization.industry = dto.industry;
    }
    if (dto.size !== undefined) {
      organization.size = dto.size;
    }
    if (dto.brandColor || dto.accentColor || dto.font) {
      organization.settings = organization.settings || {};
      organization.settings.branding =
        organization.settings.branding || ({} as any);
      const branding = organization.settings.branding!;
      if (dto.brandColor) {
        branding.primaryColor = dto.brandColor;
      }
      if (dto.accentColor) {
        branding.accentColor = dto.accentColor;
      }
      if (dto.font) {
        branding.font = dto.font;
      }
    }

    await organization.save();
    return organization;
  }

  /**
   * Delete organization
   * Permission (organization:delete, owner-only) is enforced by the guard.
   * The owner must still belong to at least one other organization afterwards.
   */
  async deleteOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const organization = await this.organizationModel.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if this is the user's only organization (by membership).
    const myOrgs = await this.getMyOrganizations(userId);
    if (myOrgs.length <= 1) {
      throw new BadRequestException(
        'You cannot delete your only organization. Please create or join another organization first.',
      );
    }

    // Remove organization ID from all users' active-org pointer.
    await this.userModel.updateMany(
      { organizationId: organizationId },
      { organizationId: null },
    );

    // Drop all memberships for this org.
    await this.memberModel.deleteMany({ organizationId });

    // Delete organization
    await this.organizationModel.deleteOne({ _id: organizationId });
  }

  /**
   * Upload organization logo
   * Validates ownership, uploads to storage, and updates organization
   */
  async uploadLogo(
    organizationId: string,
    userId: string,
    file: Express.Multer.File,
  ): Promise<Organization> {
    // Validate file
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!this.storageService.isValidImageType(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
      );
    }

    if (!this.storageService.isValidFileSize(file.size, 2)) {
      throw new BadRequestException('File size exceeds 2MB limit');
    }

    // Find organization
    const organization = await this.organizationModel.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Ownership/permission is enforced by the PermissionsGuard (organization:update).

    // Generate storage key
    const key = this.storageService.generateKey(
      'organizations',
      organizationId,
      'logo',
      file.originalname,
    );

    // Upload to storage
    const { url } = await this.storageService.upload(
      file.buffer,
      key,
      file.mimetype,
    );

    // Update organization with logo URL
    organization.logo = url;
    await organization.save();

    return organization;
  }
}
