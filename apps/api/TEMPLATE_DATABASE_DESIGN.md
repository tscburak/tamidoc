# Template Database Design

## Overview
This document outlines the database schema design for storing templates in Tamidoc, supporting the WYSIWYG template designer with version control and organization multi-tenancy.

## Database Choice: MongoDB

**Why MongoDB?**
1. **Flexible schema** - Template components have varying structures (text, image, shape)
2. **Nested documents** - Components, groups, and fields are naturally hierarchical
3. **Existing infrastructure** - Backend already uses Mongoose with User/Organization schemas
4. **Document storage** - Can store page backgrounds as data URLs or references

## Schema Structure

### Main Template Entity
```typescript
{
  name: string
  category: string
  description: string
  color: string
  organizationId: ObjectId (ref: Organization)
  createdBy: ObjectId (ref: User)
  updatedBy: ObjectId (ref: User)
  
  // Current version data
  version: string
  canvas: { size, components[], pageBackgrounds[] }
  groups: ComponentGroup[]
  fields: TemplateField[]
  
  // Version history
  versions: TemplateVersion[]
  
  // Status
  status: 'draft' | 'published' | 'archived'
  publishedAt?: Date
  archivedAt?: Date
  
  // Usage tracking
  fillCount: number
  tags: string[]
  
  createdAt: Date
  updatedAt: Date
}
```

### Version History
Each template maintains a `versions` array for version control:
- Stores previous canvas states
- Tracks who made changes
- Allows rollback to previous versions
- Supports draft versions before publishing

### Canvas Components
Embedded documents with polymorphic types:
- **TextComponent**: Font styling, alignment, merge fields (`{{token}}`)
- **ImageComponent**: Source URL, object fit, optional field name
- **ShapeComponent**: Geometry, fill/stroke styling

### Component Groups
Logical grouping for repeating sections:
- Members are component IDs (not nested, preserving geometry)
- Direction (row/column) controls layout at fill time
- Supports repeating groups for array data

### Form Fields
Extracted from document content:
- Named from `{{token}}` or image slots
- Typed (text, number, date, checkbox, signature, etc.)
- Required flag
- Optional group ID for repeating field arrays

## Key Design Decisions

### 1. Embed vs Reference
- **Components**: Embedded (small, always loaded with template)
- **Groups**: Embedded (small, tightly coupled to components)
- **Page Backgrounds**: Embedded as data URLs (PDF import)
- **Versions**: Embedded (version history usually < 10 versions)

### 2. Organization Multi-Tenancy
- Every template belongs to an organization
- Queries are scoped by `organizationId`
- Prevents cross-org data leakage

### 3. Version Control Strategy
- Current version data duplicated in main template (performance)
- Full version history in `versions` array
- Supports draft → published → archived lifecycle

### 4. Storage Integration
- `pageBackgrounds`: Embedded data URLs (PDF backgrounds)
- `storagePath`: Optional reference to external storage (S3, etc.)
- Future: Could extract to dedicated storage service

## Database Indexes
```javascript
{ organizationId: 1, status: 1 }        // Filter by status
{ organizationId: 1, category: 1 }       // Filter by category
{ organizationId: 1, createdAt: -1 }    // Sort by recency
{ createdBy: 1 }                         // User's templates
{ name: 'text', category: 'text', description: 'text' } // Search
```

## API Design (Planned)

### Endpoints
```
GET    /templates              - List org templates
GET    /templates/:id          - Get single template
POST   /templates              - Create template
PUT    /templates/:id          - Update template
DELETE /templates/:id          - Delete template
POST   /templates/:id/publish  - Publish draft
POST   /templates/:id/archive  - Archive published
```

### Query Filters
- `status`: draft/published/archived
- `category`: HR, Legal, etc.
- `search`: name/description search
- `sortBy`: createdAt, updatedAt, name
- `limit`, `page`: Pagination

## Data Migration Plan

### Phase 1: Backend Implementation
1. ✅ Schema definition
2. ⏳ Templates module with CRUD operations
3. ⏳ Controllers with validation
4. ⏳ Service layer with business logic
5. ⏳ Repository layer for database access

### Phase 2: Frontend Integration
1. ⏳ API service layer
2. ⏳ Replace in-memory store with API calls
3. ⏳ Loading/error states
4. ⏳ Optimistic updates
5. ⏳ Cache strategy

### Phase 3: Advanced Features
1. ⏳ Real version control UI
2. ⏳ Publishing workflow
3. ⏳ Usage analytics
4. ⏳ Search improvements
5. ⏳ Bulk operations

## Performance Considerations

### Document Size
- **Single template**: ~50-200KB (typical)
- **With page backgrounds**: ~500KB-2MB (PDF import)
- **With 10 versions**: ~5-20MB

### Optimization Strategies
1. **Pagination**: Limit list results (default 25)
2. **Selective fields**: Don't always return `versions`
3. **Compression**: Consider compressing page backgrounds
4. **CDN**: External storage for large assets
5. **Caching**: Redis for frequently-accessed templates

### Scaling Limits
- **MongoDB document size**: 16MB max per document
- **Practical limit**: ~100 components per template
- **Versions**: Consider archiving old versions

## Security & Privacy

### Access Control
- Templates scoped by `organizationId`
- User access through org membership
- No cross-organization data access

### Sensitive Data
- Template content may contain PII
- Page backgrounds may contain sensitive info
- Consider encryption for regulated industries

### Audit Trail
- `createdBy`, `updatedBy` tracking
- `publishedAt`, `archivedAt` timestamps
- Version history with change descriptions

## Future Enhancements

1. **Template Sharing**: Cross-organization templates
2. **Template Marketplace**: Public template library
3. **AI Suggestions**: Component recommendations
4. **Collaborative Editing**: Real-time collaboration
5. **Advanced Search**: Full-text search, filters
6. **Analytics**: Usage patterns, popular templates

## Next Steps

1. ✅ **Design schema** (COMPLETED)
2. ⏳ **Implement backend templates module**
3. ⏳ **Create API endpoints**
4. ⏳ **Frontend integration**
5. ⏳ **Testing & validation**
