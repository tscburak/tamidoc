import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import type { ImportedTextLayout } from '../../pdf-render/lib/types';
import type {
  DocBlock,
  DocumentConfig,
  DocumentFormat,
} from '../../pdf-render/lib/document-types';

/**
 * Canvas component types for the WYSIWYG designer
 */
export type ComponentKind = 'text' | 'image' | 'shape' | 'table';
export type ShapeKind = 'rectangle' | 'ellipse' | 'line';
export type TableBorder = 'none' | 'outline' | 'grid';
export type HorizontalAlign = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'medium' | 'semibold' | 'bold';
export type FontStyle = 'normal' | 'italic';
export type TextDecoration = 'none' | 'underline';
export type ObjectFit = 'cover' | 'contain' | 'fill';

/**
 * Position/size in design-space pixels
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Base component interface with common properties
 */
interface BaseComponent extends Box {
  id: string;
  kind: ComponentKind;
  rotation: number;
  page: number;
}

/**
 * Text component with merge field support
 */
export interface TextComponent extends BaseComponent {
  importedText?: ImportedTextLayout;
  fontAscent?: number;
  fontFamily?:
    'Helvetica' | 'Times-Roman' | 'Courier' | 'Lato' | 'DejaVuSerifCondensed' | 'DejaVuSans' | 'DejaVuSansMono';
  kind: 'text';
  content: string;
  fontSize: number;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  color: string;
  align: HorizontalAlign;
  lineHeight: number;
  /** Optional inline-typography overlay. */
  marks?: TextMark[];
}

/** Inline-typography overlay. Offsets are character indices into `content`. */
export interface TextMark {
  color?: string;
  start: number;
  end: number;
  fontWeight?: FontWeight;
  fontSize?: number;
  fontStyle?: FontStyle;
  textDecoration?: TextDecoration;
}

/**
 * Image component with optional fillable field
 */
export interface ImageComponent extends BaseComponent {
  kind: 'image';
  src: string;
  alt: string;
  objectFit: ObjectFit;
  radius: number;
  field?: string;
}

/**
 * Shape component (rectangle, ellipse, line)
 */
export interface ShapeComponent extends BaseComponent {
  kind: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

/**
 * Table component — cells may contain {{token}} placeholders.
 */
export interface TableComponent extends BaseComponent {
  kind: 'table';
  rows: number;
  cols: number;
  cells: string[];
  colWidths?: number[];
  rowHeight: number;
  border: TableBorder;
  zebra: boolean;
  zebraColor: string;
  headerFill: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: string;
  align: HorizontalAlign;
}

export type CanvasComponent =
  TextComponent | ImageComponent | ShapeComponent | TableComponent;

/**
 * Canvas size configuration
 */
export interface CanvasSize {
  width: number;
  height: number;
}

/**
 * Repeating group for dynamic data sections
 */
export type GroupDirection = 'row' | 'column';

export interface ComponentGroup {
  id: string;
  name: string;
  memberIds: string[];
  repeating: boolean;
  direction: GroupDirection;
}

/**
 * Form field extracted from the document
 */
export interface TemplateField {
  name: string;
  type: string;
  required: boolean;
  groupId?: string;
  // Per-field metadata for fill-time UX
  defaultValue?: string;
  placeholder?: string;
  info?: string;
  section?: string;
  options?: string[];
  defaultToday?: boolean;
  /** Read-only at fill time (prefilled with defaultValue, not editable). */
  disabled?: boolean;
  /** Hidden from the filler; PDF still carries it filled with defaultValue. */
  visible?: boolean;
  /** Hidden from the filler; the form owner is prompted for the value when
   *  generating/downloading the document (scalar fields only). */
  askOnGenerate?: boolean;
}

/**
 * Canvas subdocument schema - using raw schema for reliable JSON storage
 */
@Schema()
export class Canvas {
  @Prop({
    type: {
      width: { type: Number, required: true },
      height: { type: Number, required: true },
    },
    required: true,
  })
  size: CanvasSize;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        kind: {
          type: String,
          required: true,
          enum: ['text', 'image', 'shape', 'table'],
        },
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        rotation: { type: Number, required: true },
        page: { type: Number, required: true },
        // Designer visibility/lock toggles (from the Layers panel)
        hidden: { type: Boolean, required: false },
        locked: { type: Boolean, required: false },
        // Text-specific fields
        content: { type: String, required: false },
        fontFamily: { type: String, required: false },
        fontAscent: { type: Number, required: false },
        importedText: { type: MongooseSchema.Types.Mixed, required: false },
        fontSize: { type: Number, required: false },
        fontWeight: { type: String, required: false },
        fontStyle: { type: String, required: false },
        textDecoration: { type: String, required: false },
        color: { type: String, required: false },
        align: { type: String, required: false },
        lineHeight: { type: Number, required: false },
        // Inline-typography overlay (text only)
        marks: { type: [Object], required: false },
        // Image-specific fields
        src: { type: String, required: false },
        alt: { type: String, required: false },
        objectFit: { type: String, required: false },
        radius: { type: Number, required: false },
        field: { type: String, required: false },
        // Shape-specific fields
        shape: { type: String, required: false },
        fill: { type: String, required: false },
        stroke: { type: String, required: false },
        strokeWidth: { type: Number, required: false },
        // Table-specific fields
        rows: { type: Number, required: false },
        cols: { type: Number, required: false },
        cells: { type: [String], required: false },
        colWidths: { type: [Number], required: false },
        rowHeight: { type: Number, required: false },
        border: { type: String, required: false },
        zebra: { type: Boolean, required: false },
        zebraColor: { type: String, required: false },
        headerFill: { type: String, required: false },
      },
    ],
    default: [],
  })
  components: any[];

  @Prop({ type: [String], default: [] })
  pageBackgrounds: string[];
}

export const CanvasSchema = SchemaFactory.createForClass(Canvas);

/**
 * Template version for version control
 */
@Schema({ timestamps: true })
export class TemplateVersion extends Document {
  @Prop({ required: true })
  version: string;

  @Prop({ type: CanvasSchema, required: false })
  canvas: Canvas;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        memberIds: { type: [String], default: [] },
        repeating: { type: Boolean, default: true },
        direction: { type: String, default: 'column' },
      },
    ],
    default: [],
  })
  groups: ComponentGroup[];

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        type: { type: String, required: true },
        required: { type: Boolean, default: false },
        groupId: { type: String, required: false },
        // Per-field metadata for fill-time UX
        defaultValue: { type: String, required: false },
        placeholder: { type: String, required: false },
        info: { type: String, required: false },
        section: { type: String, required: false },
        options: { type: [String], default: [], required: false },
        defaultToday: { type: Boolean, required: false },
        disabled: { type: Boolean, required: false },
        visible: { type: Boolean, required: false },
        askOnGenerate: { type: Boolean, required: false },
      },
    ],
    default: [],
  })
  fields: TemplateField[];

  @Prop({ enum: ['form', 'document'], default: 'form' })
  kind: 'form' | 'document';

  @Prop({ type: String, enum: ['document', 'slides'] })
  format?: DocumentFormat;

  @Prop({ type: MongooseSchema.Types.Mixed })
  documentConfig?: DocumentConfig;

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  blocks?: DocBlock[];

  @Prop({ default: false })
  isDraft: boolean;

  @Prop()
  changeDescription?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  createdAt: Date;
}

export const TemplateVersionSchema =
  SchemaFactory.createForClass(TemplateVersion);

/**
 * Main Template entity
 */
@Schema({ timestamps: true })
export class Template extends Document {
  @Prop({ required: true })
  name: string;

  /** Legacy grouping field. Superseded by tags — kept optional for backward
   * compatibility with existing templates. New templates do not use it. */
  @Prop({ lowercase: true, trim: true })
  category?: string;

  @Prop()
  description: string;

  @Prop({ default: 'orange' })
  color: string;

  // Organization ownership
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  // Current version data (for backward compatibility and convenience)
  @Prop({ required: true })
  version: string;

  /** Which version new forms/generated docs resolve to. Defaults to the
   * current version on publish; author can override later. */
  @Prop()
  defaultVersion?: string;

  /** Human description of the current version (set when a new version is cut). */
  @Prop()
  versionDescription?: string;

  @Prop({ type: CanvasSchema, required: false })
  canvas: Canvas;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        memberIds: { type: [String], default: [] },
        repeating: { type: Boolean, default: true },
        direction: { type: String, default: 'column' },
      },
    ],
    default: [],
  })
  groups: ComponentGroup[];

  @Prop({
    type: [
      {
        name: { type: String, required: true },
        type: { type: String, required: true },
        required: { type: Boolean, default: false },
        groupId: { type: String, required: false },
        // Per-field metadata for fill-time UX
        defaultValue: { type: String, required: false },
        placeholder: { type: String, required: false },
        info: { type: String, required: false },
        section: { type: String, required: false },
        options: { type: [String], default: [], required: false },
        defaultToday: { type: Boolean, required: false },
        disabled: { type: Boolean, required: false },
        visible: { type: Boolean, required: false },
        askOnGenerate: { type: Boolean, required: false },
      },
    ],
    default: [],
  })
  fields: TemplateField[];

  /** Template kind: `form` (Fixed-layout Template) or `document` (Composable Template, flow blocks). */
  @Prop({ enum: ['form', 'document'], default: 'form' })
  kind: 'form' | 'document';

  /** Document-kind only: `document` (continuous flow) or `slides` (deck). */
  @Prop({ type: String, enum: ['document', 'slides'] })
  format?: DocumentFormat;

  /** Document-kind only: allowed blocks + theme (the author-defined schema). */
  @Prop({ type: MongooseSchema.Types.Mixed })
  documentConfig?: DocumentConfig;

  /** Document-kind only: the author's composed starting document. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  blocks?: DocBlock[];

  // Version history
  @Prop({ type: [TemplateVersionSchema], default: [] })
  versions: TemplateVersion[];

  // Status
  @Prop({ enum: ['draft', 'published', 'archived'], default: 'draft' })
  status: 'draft' | 'published' | 'archived';

  // Publishing
  @Prop()
  publishedAt?: Date;

  @Prop()
  archivedAt?: Date;

  // Usage statistics
  @Prop({ default: 0 })
  fillCount: number;

  // Tags for discoverability
  @Prop({ type: [String], default: [] })
  tags: string[];

  /** Optional access whitelist. When empty, every org member may access the
   * template. When populated, only members holding one of these roles (plus
   * owners/admins) may view/edit it. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Role' }], default: [] })
  allowedRoleIds: Types.ObjectId[];

  // Storage references (if using external storage for assets)
  @Prop()
  storagePath?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);

// Export Document type for mongoose
export type TemplateDocument = Template & Document;

// Indexes
TemplateSchema.index({ organizationId: 1, status: 1 });
TemplateSchema.index({ organizationId: 1, category: 1 });
TemplateSchema.index({ organizationId: 1, createdAt: -1 });
TemplateSchema.index({ createdBy: 1 });
TemplateSchema.index({ name: 'text', category: 'text', description: 'text' }); // Search
