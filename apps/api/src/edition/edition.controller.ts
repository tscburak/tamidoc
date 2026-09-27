import { Controller, Get } from '@nestjs/common';

@Controller('edition')
export class EditionController {
  @Get()
  getEdition() {
    const enterprise = process.env.TAMIDOC_EDITION === 'enterprise';
    return {
      edition: enterprise ? 'enterprise' : 'community',
      capabilities: {
        templates: true,
        forms: true,
        pdf: true,
        apiKeys: true,
        publicSharing: true,
        customRoles: enterprise,
        memberManagement: enterprise,
        invitations: enterprise,
      },
    };
  }
}
