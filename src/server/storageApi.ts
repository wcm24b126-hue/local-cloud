/**
 * GCS JSON API Compatibility Layer
 * Emulates /api/gcp/storage/v1 REST endpoints conforming to Google Cloud Storage API specifications.
 * Allows client SDKs with STORAGE_EMULATOR_HOST to interact with LocalCloud storage.
 */

import { Bucket, StorageObject } from '../types';

export interface GcsBucketResource {
  kind: 'storage#bucket';
  id: string;
  selfLink: string;
  name: string;
  projectNumber: string;
  location: string;
  locationType: string;
  storageClass: string;
  updated: string;
  timeCreated: string;
  iamConfiguration: {
    uniformBucketLevelAccess: {
      enabled: boolean;
    };
    publicAccessPrevention: string;
  };
  versioning?: {
    enabled: boolean;
  };
}

export interface GcsObjectResource {
  kind: 'storage#object';
  id: string;
  selfLink: string;
  name: string;
  bucket: string;
  contentType: string;
  size: string;
  md5Hash: string;
  storageClass: string;
  timeCreated: string;
  updated: string;
}

export function formatGcsBucket(bucket: Bucket, projectNumber = '460008'): GcsBucketResource {
  return {
    kind: 'storage#bucket',
    id: bucket.name,
    selfLink: `/api/gcp/storage/v1/b/${bucket.name}`,
    name: bucket.name,
    projectNumber,
    location: bucket.location,
    locationType: bucket.locationType,
    storageClass: bucket.storageClass,
    updated: bucket.updatedAt,
    timeCreated: bucket.createdAt,
    iamConfiguration: {
      uniformBucketLevelAccess: {
        enabled: bucket.accessControl === 'UNIFORM',
      },
      publicAccessPrevention: bucket.publicAccessPrevention ? 'enforced' : 'inherited',
    },
    versioning: {
      enabled: bucket.versioning,
    },
  };
}

export function formatGcsObject(obj: StorageObject): GcsObjectResource {
  return {
    kind: 'storage#object',
    id: `${obj.bucketName}/${obj.name}/${Date.parse(obj.updatedAt)}`,
    selfLink: `/api/gcp/storage/v1/b/${obj.bucketName}/o/${encodeURIComponent(obj.name)}`,
    name: obj.name,
    bucket: obj.bucketName,
    contentType: obj.contentType,
    size: String(obj.size),
    md5Hash: obj.md5Hash,
    storageClass: obj.storageClass,
    timeCreated: obj.updatedAt,
    updated: obj.updatedAt,
  };
}

/**
 * In-memory / client-side mock dispatcher for GCS JSON API compatibility
 */
export class LocalGcsApiEngine {
  constructor(
    private getBuckets: () => Bucket[],
    private getObjects: () => StorageObject[],
    private onBucketCreate: (b: Partial<Bucket>) => Bucket,
    private onBucketDelete: (id: string) => void,
    private onObjectUpload: (bName: string, name: string, data: { name: string; size: number; type: string; content?: string }) => StorageObject,
    private onObjectDelete: (id: string) => void
  ) {}

  public listBuckets(projectId: string) {
    const items = this.getBuckets()
      .filter(b => b.projectId === projectId || true)
      .map(b => formatGcsBucket(b));
    return {
      kind: 'storage#buckets',
      items,
    };
  }

  public getBucket(bucketName: string) {
    const found = this.getBuckets().find(b => b.name === bucketName);
    if (!found) {
      return {
        error: {
          code: 404,
          message: `The specified bucket does not exist: ${bucketName}`,
          status: 'NOT_FOUND',
        },
      };
    }
    return formatGcsBucket(found);
  }

  public listObjects(bucketName: string, prefix?: string, delimiter?: string) {
    const bucket = this.getBuckets().find(b => b.name === bucketName);
    if (!bucket) {
      return {
        error: {
          code: 404,
          message: `Not Found: gs://${bucketName}`,
          status: 'NOT_FOUND',
        },
      };
    }

    let all = this.getObjects().filter(o => o.bucketName === bucketName);
    const prefixes: string[] = [];

    if (prefix) {
      all = all.filter(o => o.name.startsWith(prefix));
    }

    if (delimiter === '/') {
      const filteredFiles: StorageObject[] = [];
      const prefixLength = prefix ? prefix.length : 0;

      all.forEach(o => {
        const rest = o.name.slice(prefixLength);
        const slashIdx = rest.indexOf('/');
        if (slashIdx !== -1) {
          const folderPrefix = (prefix || '') + rest.slice(0, slashIdx + 1);
          if (!prefixes.includes(folderPrefix)) {
            prefixes.push(folderPrefix);
          }
        } else {
          filteredFiles.push(o);
        }
      });

      return {
        kind: 'storage#objects',
        items: filteredFiles.map(formatGcsObject),
        prefixes,
      };
    }

    return {
      kind: 'storage#objects',
      items: all.map(formatGcsObject),
    };
  }

  public getObject(bucketName: string, objectName: string, alt?: string) {
    const obj = this.getObjects().find(o => o.bucketName === bucketName && o.name === objectName);
    if (!obj) {
      return {
        error: {
          code: 404,
          message: `No such object: ${bucketName}/${objectName}`,
          status: 'NOT_FOUND',
        },
      };
    }

    if (alt === 'media') {
      return {
        isMedia: true,
        data: obj.contentData || '',
        contentType: obj.contentType,
      };
    }

    return formatGcsObject(obj);
  }
}
