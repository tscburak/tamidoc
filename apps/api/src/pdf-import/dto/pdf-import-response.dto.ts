import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
} from 'class-validator';

class BoxDto {
  @ApiProperty()
  @IsNumber()
  x: number;

  @ApiProperty()
  @IsNumber()
  y: number;

  @ApiProperty()
  @IsNumber()
  width: number;

  @ApiProperty()
  @IsNumber()
  height: number;
}

class CanvasSizeDto {
  @ApiProperty()
  @IsNumber()
  width: number;

  @ApiProperty()
  @IsNumber()
  height: number;
}

class PageDto extends CanvasSizeDto {
  @ApiProperty({ description: 'Lossless PNG data URL of the source page' })
  @IsString()
  background: string;
}

class ComponentDto extends BoxDto {
  @ApiPropertyOptional({
    description:
      'Original paragraph fragment positions, retained until editing',
  })
  @IsOptional()
  importedText?: import('../../pdf-render/lib/types').ImportedTextLayout;

  @ApiPropertyOptional({
    description: 'Source text baseline, relative to font size',
  })
  @IsOptional()
  @IsNumber()
  fontAscent?: number;

  @ApiPropertyOptional({
    enum: [
      'Helvetica',
      'Times-Roman',
      'Courier',
      'Lato',
      'DejaVuSerifCondensed',
      'DejaVuSans',
      'DejaVuSansMono',
    ],
  })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textDecoration?: string;
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ enum: ['text', 'image', 'shape'] })
  @IsString()
  kind: string;

  @ApiProperty()
  @IsNumber()
  rotation: number;

  @ApiProperty()
  @IsNumber()
  page: number;

  // TextComponent properties
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fontSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontWeight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontStyle?: string;

  @ApiPropertyOptional({
    type: 'array',
    description: 'In-text style overrides (bold/italic ranges) over content',
  })
  @IsOptional()
  marks?: {
    start: number;
    end: number;
    color?: string;
    fontWeight?: string;
    fontStyle?: string;
  }[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  align?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lineHeight?: number;

  // ImageComponent properties
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  src?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  objectFit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  radius?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  field?: string;

  // ShapeComponent properties
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shape?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fill?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stroke?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  strokeWidth?: number;
}

class FieldDto {
  @ApiPropertyOptional({ type: [String] })
  options?: string[];
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({
    enum: [
      'text',
      'longtext',
      'number',
      'date',
      'email',
      'checkbox',
      'dropdown',
      'signature',
      'image',
    ],
  })
  @IsString()
  type: string;

  @ApiProperty()
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  componentId?: string;
}

export class PdfImportResponseDto {
  @ApiPropertyOptional({
    description:
      'Persisted Jev detection run, token usage, estimated USD cost and timings',
    type: Object,
  })
  detection?: import('../lib/detection-types').DetectionMetrics;
  @ApiProperty({
    type: [String],
    description:
      'Pages preserved as artwork when editable extraction would lose content',
  })
  warnings: string[];
  @ApiProperty({ type: CanvasSizeDto })
  canvasSize: CanvasSizeDto;

  @ApiProperty()
  pageCount: number;

  @ApiProperty({ type: [PageDto] })
  pages: PageDto[];

  @ApiProperty({ type: [ComponentDto] })
  components: ComponentDto[];

  @ApiProperty({ type: [FieldDto] })
  fields: FieldDto[];
}
