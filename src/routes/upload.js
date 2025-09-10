const express = require("express");
const { v4: uuidv4 } = require("uuid");
const {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  deleteFile,
  isS3Configured,
  generateFileKey,
  initiateMultipartUpload,
  generateMultipartUploadUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  calculateMultipartParams,
} = require("../config/aws");
const { validateFileUpload } = require("../middleware");

const router = express.Router();

// In-memory storage for upload tracking (in production, use a database)
const uploads = new Map();

/**
 * GET /api/upload/health
 * Health check endpoint
 */
router.get("/health", (req, res) => {
  const s3Configured = isS3Configured();

  res.json({
    success: true,
    data: {
      status: "healthy",
      s3Configured,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/upload/presigned-url
 * Generate a presigned URL for file upload
 */
router.post("/presigned-url", validateFileUpload, async (req, res, next) => {
  try {
    const { fileName, contentType, userId } = req.body;
    const uploadId = uuidv4();

    // Generate unique S3 key
    const s3Key = generateFileKey(fileName, userId);

    // Generate presigned URL
    const expiresIn = parseInt(process.env.S3_PRESIGNED_URL_EXPIRES) || 3600;
    const presignedUrl = await generatePresignedUploadUrl(
      s3Key,
      contentType,
      expiresIn
    );

    // Store upload metadata
    const uploadData = {
      uploadId,
      fileName,
      contentType,
      s3Key,
      userId: userId || "anonymous",
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };

    uploads.set(uploadId, uploadData);

    res.json({
      success: true,
      data: {
        uploadId,
        presignedUrl,
        s3Key,
        expiresIn,
        expiresAt: uploadData.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/upload/confirm
 * Confirm successful upload
 */
router.post("/confirm", async (req, res, next) => {
  try {
    const { uploadId } = req.body;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        error: {
          message: "uploadId is required",
          status: 400,
        },
      });
    }

    const uploadData = uploads.get(uploadId);
    if (!uploadData) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Upload not found",
          status: 404,
        },
      });
    }

    // Update upload status
    uploadData.status = "completed";
    uploadData.completedAt = new Date().toISOString();
    uploads.set(uploadId, uploadData);

    // Generate download URL (optional)
    const downloadUrl = await generatePresignedDownloadUrl(
      uploadData.s3Key,
      3600
    );

    res.json({
      success: true,
      data: {
        uploadId,
        status: "completed",
        fileName: uploadData.fileName,
        s3Key: uploadData.s3Key,
        downloadUrl,
        completedAt: uploadData.completedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/upload/:uploadId
 * Get upload status and details
 */
router.get("/:uploadId", (req, res) => {
  const { uploadId } = req.params;

  const uploadData = uploads.get(uploadId);
  if (!uploadData) {
    return res.status(404).json({
      success: false,
      error: {
        message: "Upload not found",
        status: 404,
      },
    });
  }

  res.json({
    success: true,
    data: uploadData,
  });
});

/**
 * DELETE /api/upload/:uploadId
 * Delete uploaded file
 */
router.delete("/:uploadId", async (req, res, next) => {
  try {
    const { uploadId } = req.params;

    const uploadData = uploads.get(uploadId);
    if (!uploadData) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Upload not found",
          status: 404,
        },
      });
    }

    // Delete from S3 if upload was completed
    if (uploadData.status === "completed") {
      await deleteFile(uploadData.s3Key);
    }

    // Remove from memory
    uploads.delete(uploadId);

    res.json({
      success: true,
      data: {
        message: "Upload deleted successfully",
        uploadId,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/upload
 * List all uploads (for debugging/admin purposes)
 */
router.get("/", (req, res) => {
  const { userId, status } = req.query;

  let filteredUploads = Array.from(uploads.values());

  if (userId) {
    filteredUploads = filteredUploads.filter(
      (upload) => upload.userId === userId
    );
  }

  if (status) {
    filteredUploads = filteredUploads.filter(
      (upload) => upload.status === status
    );
  }

  res.json({
    success: true,
    data: {
      uploads: filteredUploads,
      total: filteredUploads.length,
    },
  });
});

/**
 * POST /api/upload/download-url
 * Generate a presigned URL for file download
 */
router.post("/download-url", async (req, res, next) => {
  try {
    const { s3Key, expiresIn = 3600 } = req.body;

    if (!s3Key) {
      return res.status(400).json({
        success: false,
        error: {
          message: "s3Key is required",
          status: 400,
        },
      });
    }

    const downloadUrl = await generatePresignedDownloadUrl(s3Key, expiresIn);

    res.json({
      success: true,
      data: {
        downloadUrl,
        s3Key,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/upload/multipart/initiate
 * Initiate a multipart upload
 */
router.post(
  "/multipart/initiate",
  validateFileUpload,
  async (req, res, next) => {
    try {
      const { fileName, contentType, fileSize, userId } = req.body;

      if (!fileSize) {
        return res.status(400).json({
          success: false,
          error: {
            message: "fileSize is required for multipart upload",
            status: 400,
          },
        });
      }

      const uploadId = uuidv4();
      const s3Key = generateFileKey(fileName, userId);

      // Calculate multipart parameters
      const multipartParams = calculateMultipartParams(fileSize);

      if (!multipartParams.useMultipart) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              "File size does not require multipart upload. Use regular upload instead.",
            status: 400,
          },
        });
      }

      // Initiate multipart upload with S3
      const s3UploadId = await initiateMultipartUpload(s3Key, contentType);

      // Generate presigned URLs for all parts
      const expiresIn = parseInt(process.env.S3_PRESIGNED_URL_EXPIRES) || 3600;
      const partUrls = await generateMultipartUploadUrls(
        s3Key,
        s3UploadId,
        multipartParams.partCount,
        expiresIn
      );

      // Store upload metadata
      const uploadData = {
        uploadId,
        s3UploadId,
        fileName,
        contentType,
        fileSize,
        s3Key,
        userId: userId || "anonymous",
        status: "multipart-initiated",
        type: "multipart",
        partSize: multipartParams.partSize,
        partCount: multipartParams.partCount,
        completedParts: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      };

      uploads.set(uploadId, uploadData);

      res.json({
        success: true,
        data: {
          uploadId,
          s3UploadId,
          s3Key,
          partSize: multipartParams.partSize,
          partCount: multipartParams.partCount,
          partUrls,
          expiresIn,
          expiresAt: uploadData.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/upload/multipart/complete
 * Complete a multipart upload
 */
router.post("/multipart/complete", async (req, res, next) => {
  try {
    const { uploadId, parts } = req.body;

    if (!uploadId || !parts || !Array.isArray(parts)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "uploadId and parts array are required",
          status: 400,
        },
      });
    }

    const uploadData = uploads.get(uploadId);
    if (!uploadData) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Upload not found",
          status: 404,
        },
      });
    }

    if (uploadData.type !== "multipart") {
      return res.status(400).json({
        success: false,
        error: {
          message: "Upload is not a multipart upload",
          status: 400,
        },
      });
    }

    // Validate parts
    if (parts.length !== uploadData.partCount) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Expected ${uploadData.partCount} parts, received ${parts.length}`,
          status: 400,
        },
      });
    }

    // Complete multipart upload with S3
    const result = await completeMultipartUpload(
      uploadData.s3Key,
      uploadData.s3UploadId,
      parts
    );

    // Update upload status
    uploadData.status = "completed";
    uploadData.completedAt = new Date().toISOString();
    uploadData.completedParts = parts;
    uploadData.s3Location = result.Location;
    uploads.set(uploadId, uploadData);

    // Generate download URL
    const downloadUrl = await generatePresignedDownloadUrl(
      uploadData.s3Key,
      3600
    );

    res.json({
      success: true,
      data: {
        uploadId,
        status: "completed",
        fileName: uploadData.fileName,
        s3Key: uploadData.s3Key,
        s3Location: result.Location,
        downloadUrl,
        completedAt: uploadData.completedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/upload/multipart/abort
 * Abort a multipart upload
 */
router.post("/multipart/abort", async (req, res, next) => {
  try {
    const { uploadId } = req.body;

    if (!uploadId) {
      return res.status(400).json({
        success: false,
        error: {
          message: "uploadId is required",
          status: 400,
        },
      });
    }

    const uploadData = uploads.get(uploadId);
    if (!uploadData) {
      return res.status(404).json({
        success: false,
        error: {
          message: "Upload not found",
          status: 404,
        },
      });
    }

    if (uploadData.type !== "multipart") {
      return res.status(400).json({
        success: false,
        error: {
          message: "Upload is not a multipart upload",
          status: 400,
        },
      });
    }

    // Abort multipart upload with S3
    await abortMultipartUpload(uploadData.s3Key, uploadData.s3UploadId);

    // Update upload status
    uploadData.status = "aborted";
    uploadData.abortedAt = new Date().toISOString();
    uploads.set(uploadId, uploadData);

    res.json({
      success: true,
      data: {
        uploadId,
        status: "aborted",
        message: "Multipart upload aborted successfully",
        abortedAt: uploadData.abortedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
