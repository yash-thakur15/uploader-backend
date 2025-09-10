const { S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION_1,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_1,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_1,
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
    process.env.AWS_REGION_1 &&
    process.env.AWS_ACCESS_KEY_ID_1 &&
    process.env.AWS_SECRET_ACCESS_KEY_1 &&
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

module.exports = {
  s3Client,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteFile,
  isS3Configured,
  isValidFileType,
  generateFileKey,
};
