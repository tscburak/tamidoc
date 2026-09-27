import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { extname } from 'path';

/**
 * Generic file storage service using S3-compatible storage (RustFS, MinIO, AWS S3, etc.)
 * Designed to be reusable across different entities and use cases
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl: string;
  private readonly forcePathStyle: boolean;

  constructor(private configService: ConfigService) {
    // Initialize S3 client with configuration from environment variables
    this.region = this.configService.get('S3_REGION', 'us-east-1');
    this.forcePathStyle =
      this.configService.get('S3_FORCE_PATH_STYLE', 'true') === 'true';
    this.bucket = this.configService.get('S3_BUCKET', 'tamidoc');
    this.publicBaseUrl = this.configService.get('S3_PUBLIC_BASE_URL', '');

    const endpoint = this.configService.get('S3_ENDPOINT');
    if (!endpoint) {
      throw new BadRequestException('S3_ENDPOINT is not configured');
    }

    this.s3Client = new S3Client({
      region: this.region,
      endpoint: endpoint,
      credentials: {
        accessKeyId: this.configService.get('S3_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get('S3_SECRET_ACCESS_KEY', ''),
      },
      forcePathStyle: this.forcePathStyle,
    });
  }

  /**
   * Upload a file to S3-compatible storage
   * @param buffer - File buffer
   * @param key - Storage key (path/filename)
   * @param contentType - MIME type of the file
   * @returns Object with URL and key
   */
  async upload(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<{ url: string; key: string }> {
    if (!buffer || !key || !contentType) {
      throw new BadRequestException('Invalid upload parameters');
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      const url = this.getPublicUrl(key);

      return { url, key };
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Generate a unique storage key for a file upload
   * @param entityType - Type of entity (e.g., 'organizations', 'users', 'documents')
   * @param entityId - ID of the entity
   * @param fileType - Type of file (e.g., 'logo', 'avatar', 'document')
   * @param originalName - Original filename (used to extract extension)
   * @returns Storage key string
   */
  generateKey(
    entityType: string,
    entityId: string,
    fileType: string,
    originalName: string,
  ): string {
    const extension = extname(originalName);
    const timestamp = Date.now();
    // Format: {entityType}/{entityId}/{fileType}-{timestamp}{extension}
    // Example: organizations/507f1f77bcf86cd799439011/logo-1638360000000.png
    return `${entityType}/${entityId}/${fileType}-${timestamp}${extension}`;
  }

  /**
   * Get public URL for a given key
   * @param key - Storage key
   * @returns Public URL
   */
  getPublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${this.bucket}/${key}`;
    }
    // Fallback to using the S3 endpoint directly
    const endpoint = this.configService.get('S3_ENDPOINT');
    return `${endpoint}/${this.bucket}/${key}`;
  }

  /**
   * Validate file type for images
   * @param mimeType - MIME type to validate
   * @returns true if valid image type
   */
  isValidImageType(mimeType: string): boolean {
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    return validTypes.includes(mimeType);
  }

  /**
   * Validate file size
   * @param fileSize - File size in bytes
   * @param maxSizeMB - Maximum size in megabytes
   * @returns true if file size is within limit
   */
  isValidFileSize(fileSize: number, maxSizeMB: number = 2): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return fileSize <= maxSizeBytes;
  }

  /**
   * Download a file from S3-compatible storage
   * @param key - Storage key
   * @returns Object with buffer and metadata
   */
  async download(
    key: string,
  ): Promise<{ buffer: Buffer; contentType?: string; contentLength?: number }> {
    if (!key) {
      throw new BadRequestException('Invalid key parameter');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new NotFoundException('File not found or empty');
      }

      // Convert the stream to a buffer
      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      return {
        buffer,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new NotFoundException('File not found');
      }
      throw new BadRequestException(
        `Failed to download file: ${error.message}`,
      );
    }
  }

  /**
   * Delete a file from S3-compatible storage. Best-effort: logs and swallows
   * errors so cleanup (e.g. cascading form deletion) never fails the caller.
   * @param key - Storage key
   */
  async remove(key: string): Promise<void> {
    if (!key) return;
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete object at key "${key}": ${error.message}`,
      );
    }
  }

  /**
   * Delete every object under the given key prefix. Used for cascade-cleanup
   * (e.g. wiping all uploads tied to a form). Best-effort: pages through S3
   * listing and deletes in batches of 1000, swallowing errors per object so a
   * single failure can't stall the whole sweep.
   */
  async removePrefix(prefix: string): Promise<void> {
    if (!prefix) return;
    const prefixWithSep = prefix.endsWith('/') ? prefix : `${prefix}/`;
    try {
      let continuationToken: string | undefined;
      do {
        const list = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefixWithSep,
            ContinuationToken: continuationToken,
          }),
        );
        const objects = (list.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => !!k);
        if (objects.length > 0) {
          await this.s3Client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: {
                Objects: objects.map((Key) => ({ Key })),
                Quiet: true,
              },
            }),
          );
        }
        continuationToken = list.IsTruncated
          ? list.NextContinuationToken
          : undefined;
      } while (continuationToken);
    } catch (error) {
      this.logger.warn(
        `Failed to remove prefix "${prefixWithSep}": ${error.message}`,
      );
    }
  }

  /**
   * Resolve an image-source string to a Buffer that pdfkit can embed. Form-fill
   * image fields accept either a `data:image/...;base64,...` URL (legacy /
   * designer-time inline) or an S3 storage key (the public-form upload path).
   * Returns null when the value is empty or can't be resolved.
   *
   * S3 keys are bare paths (no URL prefix); `data:` URLs are decoded inline.
   * Heuristic: a data URL starts with `data:`; anything else with a slash is
   * treated as a key. If a "key" looks like a URL (e.g. accidentally stored
   * with a public URL prefix), we strip everything up to the configured bucket
   * name as a fallback.
   */
  async resolveImage(value: string | null | undefined): Promise<Buffer | null> {
    if (!value) return null;
    if (value.startsWith('data:')) {
      const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(value);
      if (!m) return null;
      try {
        return Buffer.from(m[1], 'base64');
      } catch {
        return null;
      }
    }
    // Treat as a key. If it looks like a full URL, extract the key portion.
    let key = value;
    if (/^https?:\/\//i.test(value)) {
      try {
        key = this.extractKeyFromUrl(value);
      } catch {
        return null;
      }
    }
    // Defensive: must be a relative key, not a path-traversal.
    if (key.includes('..') || key.startsWith('/')) return null;
    try {
      const { buffer } = await this.download(key);
      return buffer;
    } catch (error) {
      this.logger.warn(
        `resolveImage: failed to fetch object at key "${key}": ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Extract key from stored URL
   * @param url - Stored file URL
   * @returns Storage key
   */
  extractKeyFromUrl(url: string): string {
    console.log('Extracting key from URL:', url);
    try {
      const urlParts = url.split('/');
      console.log('URL parts:', urlParts);
      const bucketIndex = urlParts.findIndex((part) => part === this.bucket);
      console.log('Bucket name:', this.bucket, 'Bucket index:', bucketIndex);

      if (bucketIndex === -1 || bucketIndex + 1 >= urlParts.length) {
        console.log('Invalid URL format, using full path as key');
        // If we can't find the bucket in the URL, assume the URL is just the key
        // For URLs like: http://localhost:9000/tamidoc/organizations/{id}/logo-{timestamp}.png
        const apiIndex = urlParts.findIndex((part) => part === 'organizations');
        if (apiIndex !== -1 && apiIndex + 2 < urlParts.length) {
          return urlParts.slice(apiIndex).join('/');
        }
        throw new Error('Invalid URL format');
      }
      const key = urlParts.slice(bucketIndex + 1).join('/');
      console.log('Extracted key:', key);
      return key;
    } catch (error) {
      console.error('Error extracting key from URL:', error);
      throw new BadRequestException('Failed to extract key from URL');
    }
  }
}
