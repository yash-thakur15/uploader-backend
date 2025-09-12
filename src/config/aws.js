const { S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a presigned URL for uploading a file to S3
 * @param {string} key - The S3 object key (file path)
 * @param {string} contentType - The MIME type of the file
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {Promise<string>} - The presigned URL
 */
const generatePresignedUploadUrl = async (
  key,
  contentType,
  expiresIn = 3600
) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return presignedUrl;
  } catch (error) {
    console.error("Error generating presigned upload URL:", error);
    throw new Error("Failed to generate presigned upload URL");
  }
};

/**
 * Generate a presigned URL for downloading a file from S3
 * @param {string} key - The S3 object key (file path)
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {Promise<string>} - The presigned URL
 */
const generatePresignedDownloadUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  try {
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return presignedUrl;
  } catch (error) {
    console.error("Error generating presigned download URL:", error);
    throw new Error("Failed to generate presigned download URL");
  }
};

/**
 * Delete a file from S3
 * @param {string} key - The S3 object key (file path)
 * @returns {Promise<void>}
 */
const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
  });

  try {
    await s3Client.send(command);
    console.log(`File deleted successfully: ${key}`);
  } catch (error) {
    console.error("Error deleting file:", error);
    throw new Error("Failed to delete file");
  }
};

/**
 * Check if S3 credentials are configured
 * @returns {boolean}
 */
const isS3Configured = () => {
  return !!(
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  );
};

/**
 * Validate file type against allowed types
 * @param {string} contentType - The MIME type to validate
 * @returns {boolean}
 */
const isValidFileType = (contentType) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(",") || [];
  return allowedTypes.includes(contentType);
};

/**
 * Generate a unique file key for S3
 * @param {string} originalName - Original filename
 * @param {string} userId - User ID (optional)
 * @returns {string} - Unique S3 key
 */
const generateFileKey = (originalName, userId = "anonymous") => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split(".").pop();
  const baseName = originalName.split(".").slice(0, -1).join(".");

  return `${process.env.S3_UPLOAD_PATH}${userId}/${timestamp}-${randomString}-${baseName}.${extension}`;
};

/**
 * Initiate a multipart upload
 * @param {string} key - The S3 object key (file path)
 * @param {string} contentType - The MIME type of the file
 * @returns {Promise<string>} - The upload ID
 */
const initiateMultipartUpload = async (key, contentType) => {
  const command = new CreateMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  try {
    const response = await s3Client.send(command);
    return response.UploadId;
  } catch (error) {
    console.error("Error initiating multipart upload:", error);
    throw new Error("Failed to initiate multipart upload");
  }
};

/**
 * Generate presigned URLs for multipart upload parts
 * @param {string} key - The S3 object key (file path)
 * @param {string} uploadId - The multipart upload ID
 * @param {number} partCount - Number of parts to generate URLs for
 * @param {number} expiresIn - Expiration time in seconds
 * @returns {Promise<Array>} - Array of presigned URLs for each part
 */
const generateMultipartUploadUrls = async (
  key,
  uploadId,
  partCount,
  expiresIn = 3600
) => {
  const urls = [];

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const command = new UploadPartCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    try {
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      urls.push({
        partNumber,
        presignedUrl,
      });
    } catch (error) {
      console.error(
        `Error generating presigned URL for part ${partNumber}:`,
        error
      );
      throw new Error(
        `Failed to generate presigned URL for part ${partNumber}`
      );
    }
  }

  return urls;
};

/**
 * Complete a multipart upload
 * @param {string} key - The S3 object key (file path)
 * @param {string} uploadId - The multipart upload ID
 * @param {Array} parts - Array of completed parts with ETag and PartNumber
 * @returns {Promise<Object>} - The completed upload response
 */
const completeMultipartUpload = async (key, uploadId, parts) => {
  const command = new CompleteMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((part) => ({
        ETag: part.ETag,
        PartNumber: part.PartNumber,
      })),
    },
  });

  try {
    const response = await s3Client.send(command);
    return response;
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    throw new Error("Failed to complete multipart upload");
  }
};

/**
 * Abort a multipart upload
 * @param {string} key - The S3 object key (file path)
 * @param {string} uploadId - The multipart upload ID
 * @returns {Promise<void>}
 */
const abortMultipartUpload = async (key, uploadId) => {
  const command = new AbortMultipartUploadCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
  });

  try {
    await s3Client.send(command);
    console.log(`Multipart upload aborted: ${key}`);
  } catch (error) {
    console.error("Error aborting multipart upload:", error);
    throw new Error("Failed to abort multipart upload");
  }
};

/**
 * Calculate optimal part size and count for multipart upload
 * @param {number} fileSize - File size in bytes
 * @returns {Object} - Object with partSize and partCount
 */
const calculateMultipartParams = (fileSize) => {
  const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB minimum (AWS requirement)
  const PREFERRED_PART_SIZE = 50 * 1024 * 1024; // 50MB preferred chunk size
  const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB maximum (AWS limit)
  const MAX_PARTS = 10000; // AWS limit

  let partSize = PREFERRED_PART_SIZE;
  let partCount = Math.ceil(fileSize / partSize);

  // If we exceed max parts, increase part size
  if (partCount > MAX_PARTS) {
    partSize = Math.ceil(fileSize / MAX_PARTS);
    partCount = MAX_PARTS;
  }

  // Cap part size at maximum
  if (partSize > MAX_PART_SIZE) {
    partSize = MAX_PART_SIZE;
    partCount = Math.ceil(fileSize / partSize);
  }

  // Ensure minimum part size (AWS requirement)
  if (partSize < MIN_PART_SIZE) {
    partSize = MIN_PART_SIZE;
    partCount = Math.ceil(fileSize / partSize);
  }

  return {
    partSize,
    partCount,
    useMultipart: fileSize > MIN_PART_SIZE && partCount > 1,
  };
};

module.exports = {
  s3Client,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteFile,
  isS3Configured,
  isValidFileType,
  generateFileKey,
  initiateMultipartUpload,
  generateMultipartUploadUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  calculateMultipartParams,
};
