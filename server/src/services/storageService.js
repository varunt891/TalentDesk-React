import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

function sanitizeFileName(fileName) {
  return (fileName || 'resume').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

export class StorageService {
  getClient() {
    const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
    const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      const err = new Error('Resume file storage is not configured on the server (missing R2 credentials).');
      err.status = 500;
      err.code = 'CONFIG_MISSING_R2';
      throw err;
    }

    if (!this._client) {
      this._client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
    return this._client;
  }

  getBucket() {
    const bucket = (process.env.R2_BUCKET_NAME || '').trim();
    if (!bucket) {
      const err = new Error('R2_BUCKET_NAME environment variable is not configured on the server.');
      err.status = 500;
      err.code = 'CONFIG_MISSING_R2';
      throw err;
    }
    return bucket;
  }

  async uploadFile({ buffer, fileName, mimeType, orgId }) {
    const client = this.getClient();
    const bucket = this.getBucket();
    const key = `resumes/${orgId || 'unassigned'}/${randomUUID()}-${sanitizeFileName(fileName)}`;

    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    }));

    return { key, size: buffer.length };
  }

  async deleteFile(key) {
    if (!key) return;
    try {
      const client = this.getClient();
      const bucket = this.getBucket();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      console.warn('[storageService] Failed to delete resume file', key, err.message);
    }
  }

  async getSignedDownloadUrl(key, expiresInSeconds = 300) {
    const client = this.getClient();
    const bucket = this.getBucket();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }
}

export const storageService = new StorageService();
