export { TemplateDesigner, type TemplateDesignerProps, type DesignerField } from './TemplateDesigner';
export type {
  CanvasComponent,
  ComponentKind,
  ShapeKind,
  TableBorder,
  Box,
  TextComponent,
  TextMark,
  ImageComponent,
  ShapeComponent,
  TableComponent,
  ComponentGroup,
} from './types';
export { CANVAS_SIZE } from './constants';
export { bboxOf } from './coordinates';
export type { CanvasSize } from './coordinates';
export { extractFields, type ExtractedField } from './textMerge';
export { layoutStacked, groupBbox, type StackedLayoutItem } from './layout';
