import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsObject,
  IsNumber,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Define enums for better validation
export enum ComponentKind {
  TEXT = 'text',
  IMAGE = 'image',
  SHAPE = 'shape',
  TABLE = 'table',
}

export enum ShapeKind {
  RECTANGLE = 'rectangle',
  ELLIPSE = 'ellipse',
  LINE = 'line',
}

export enum TableBorder {
  NONE = 'none',
  OUTLINE = 'outline',
  GRID = 'grid',
}

export enum FontWeight {
  NORMAL = 'normal',
  MEDIUM = 'medium',
  SEMIBOLD = 'semibold',
  BOLD = 'bold',
}

export enum TextAlign {
  LEFT = 'left',
  CENTER = 'center',
  RIGHT = 'right',
}

export enum ObjectFit {
  COVER = 'cover',
  CONTAIN = 'contain',
  FILL = 'fill',
}

export enum Direction {
  ROW = 'row',
  COLUMN = 'column',
}

export class BoxDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsNumber()
  width: number;

  @IsNumber()
  height: number;
}

export class BaseComponentDto extends BoxDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsEnum(ComponentKind)
  kind: ComponentKind;

  @IsNumber()
  rotation: number;

  @IsNumber()
  page: number;

  @IsOptional()
  _id?: string;
}

export class TextComponentDto extends BaseComponentDto {
  @IsOptional()
  @IsObject()
  importedText?: import('../../pdf-render/lib/types').ImportedTextLayout;

  @IsOptional()
  @IsNumber()
  fontAscent?: number;

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  fontStyle?: string;

  @IsOptional()
  @IsString()
  textDecoration?: string;

  @IsString()
  content: string;

  @IsNumber()
  fontSize: number;

  @IsEnum(FontWeight)
  fontWeight: FontWeight;

  @IsString()
  color: string;

  @IsEnum(TextAlign)
  align: TextAlign;

  @IsNumber()
  lineHeight: number;

  @IsOptional()
  @IsArray()
  marks?: any[];
}

export class ImageComponentDto extends BaseComponentDto {
  @IsString()
  src: string;

  @IsString()
  alt: string;

  @IsEnum(ObjectFit)
  objectFit: ObjectFit;

  @IsNumber()
  radius: number;

  @IsOptional()
  @IsString()
  field?: string;
}

export class ShapeComponentDto extends BaseComponentDto {
  @IsEnum(ShapeKind)
  shape: ShapeKind;

  @IsString()
  fill: string;

  @IsString()
  stroke: string;

  @IsNumber()
  strokeWidth: number;

  @IsNumber()
  radius: number;
}

export class TableComponentDto extends BaseComponentDto {
  @IsNumber()
  rows: number;

  @IsNumber()
  cols: number;

  @IsArray()
  @IsString({ each: true })
  cells: string[];

  @IsOptional()
  @IsArray()
  colWidths?: number[];

  @IsNumber()
  rowHeight: number;

  @IsEnum(TableBorder)
  border: TableBorder;

  @IsBoolean()
  zebra: boolean;

  @IsString()
  zebraColor: string;

  @IsString()
  headerFill: string;

  @IsNumber()
  fontSize: number;

  @IsEnum(FontWeight)
  fontWeight: FontWeight;

  @IsString()
  color: string;

  @IsEnum(TextAlign)
  align: TextAlign;
}

export class CanvasSizeDto {
  @IsNumber()
  width: number;

  @IsNumber()
  height: number;

  @IsOptional()
  _id?: string;
}

export class CanvasDto {
  @IsObject()
  size: CanvasSizeDto;

  @IsArray()
  components: any[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pageBackgrounds?: string[];
}

export class ComponentGroupDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  memberIds: string[];

  @IsBoolean()
  repeating: boolean;

  @IsEnum(Direction)
  direction: Direction;
}

export class FieldOptionDto {
  @IsString()
  @IsNotEmpty()
  value: string;

  @IsString()
  label: string;
}

export class TemplateFieldDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  groupId?: string;

  // Per-field metadata for fill-time UX
  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsString()
  info?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldOptionDto)
  options?: FieldOptionDto[];

  @IsOptional()
  @IsBoolean()
  defaultToday?: boolean;

  /** Hidden from the filler; the form owner is prompted for the value when
   *  generating/downloading the document (scalar fields only). */
  @IsOptional()
  @IsBoolean()
  askOnGenerate?: boolean;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsObject()
  canvas?: CanvasDto;

  @IsOptional()
  @IsArray()
  groups?: ComponentGroupDto[];

  @IsOptional()
  @IsArray()
  fields?: TemplateFieldDto[];

  /** Template kind: `form` (Fixed-layout Template, default) or `document` (Composable Template, flow blocks). */
  @IsOptional()
  @IsEnum(['form', 'document'])
  kind?: 'form' | 'document';

  /** Document-kind only: `document` (continuous flow) or `slides` (deck). */
  @IsOptional()
  @IsEnum(['document', 'slides'])
  format?: 'document' | 'slides';

  /** Document-kind only: allowed blocks + theme. */
  @IsOptional()
  @IsObject()
  documentConfig?: Record<string, unknown>;

  /** Document-kind only: the author's composed starting document. */
  @IsOptional()
  @IsArray()
  blocks?: any[];

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoleIds?: string[];
}
