import { BadRequestException, HttpStatus } from '@nestjs/common';
import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  Header,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PdfImportWorkflowService } from './pdf-import-workflow.service';
import type { IRequestWithUser } from '../auth/interfaces/request.interface';
import { PdfImportResponseDto } from './dto/pdf-import-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('PDF Import')
@Controller('pdf-import')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PdfImportController {
  constructor(private readonly pdfImportService: PdfImportWorkflowService) {}

  @Get('runs')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'List your last 50 PDF imports and their usage and cost metrics in the active organization',
  })
  listRuns(@Request() request: IRequestWithUser) {
    return this.pdfImportService.list(request.user);
  }

  @Get('runs/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get your PDF import metrics and field detection decisions',
  })
  getRun(@Param('id') id: string, @Request() request: IRequestWithUser) {
    return this.pdfImportService.get(id, request.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import PDF artwork and detect fillable inputs with Jev',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        detectFields: {
          type: 'boolean',
          default: true,
          description: 'Add fillable input overlays using Jev',
        },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'PDF successfully imported',
    type: PdfImportResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid file or file too large' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
      },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf');
        cb(
          ok ? null : new BadRequestException('Only PDF files are allowed'),
          ok,
        );
      },
    }),
  )
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Request() request: IRequestWithUser,
    @Body('detectFields') detectFields?: string | boolean,
  ): Promise<PdfImportResponseDto> {
    if (!file?.buffer) {
      throw new BadRequestException('PDF file is required');
    }

    if (
      detectFields !== undefined &&
      ![true, false, 'true', 'false'].includes(detectFields)
    ) {
      throw new BadRequestException('detectFields must be true or false');
    }
    return this.pdfImportService.importPdf(
      file.buffer,
      request.user,
      detectFields !== false && detectFields !== 'false',
    );
  }
}
