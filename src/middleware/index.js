const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

/**
 * Configure CORS middleware
 */
const configureCors = () => {
  const corsOptions = {
    origin: true, // Allow all origins
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  };

  return cors(corsOptions);
};

/**
 * Configure security middleware
 */
const configureSecurity = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
};

/**
 * Configure logging middleware
 */
const configureLogging = () => {
  const format = process.env.NODE_ENV === "production" ? "combined" : "dev";
  return morgan(format);
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Default error
  let error = {
    message: "Internal Server Error",
    status: 500,
  };

  // Handle specific error types
  if (err.name === "ValidationError") {
    error.message = "Validation Error";
    error.status = 400;
    error.details = err.message;
  } else if (err.name === "UnauthorizedError") {
    error.message = "Unauthorized";
    error.status = 401;
  } else if (err.message === "Not allowed by CORS") {
    error.message = "CORS Error";
    error.status = 403;
  } else if (err.code === "LIMIT_FILE_SIZE") {
    error.message = "File too large";
    error.status = 413;
    error.details = `Maximum file size is ${process.env.MAX_FILE_SIZE} bytes`;
  } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
    error.message = "Unexpected file field";
    error.status = 400;
  } else if (err.message.includes("AWS") || err.message.includes("S3")) {
    error.message = "AWS Service Error";
    error.status = 502;
    error.details =
      process.env.NODE_ENV === "development" ? err.message : undefined;
  }

  // Send error response
  res.status(error.status).json({
    success: false,
    error: {
      message: error.message,
      status: error.status,
      ...(error.details && { details: error.details }),
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
};

/**
 * 404 handler middleware
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: "Route not found",
      status: 404,
      path: req.originalUrl,
    },
  });
};

/**
 * Request validation middleware
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Validation Error",
          status: 400,
          details: error.details.map((detail) => detail.message),
        },
      });
    }
    next();
  };
};

/**
 * File upload validation middleware
 */
const validateFileUpload = (req, res, next) => {
  if (!req.body.fileName) {
    return res.status(400).json({
      success: false,
      error: {
        message: "fileName is required",
        status: 400,
      },
    });
  }

  if (!req.body.contentType) {
    return res.status(400).json({
      success: false,
      error: {
        message: "contentType is required",
        status: 400,
      },
    });
  }

  // Validate file size if provided (skip validation for video files)
  if (req.body.fileSize && !req.body.contentType.startsWith("video/")) {
    const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 32212254720; // 30GB default
    if (req.body.fileSize > maxFileSize) {
      const maxSizeGB = (maxFileSize / (1024 * 1024 * 1024)).toFixed(1);
      const fileSizeGB = (req.body.fileSize / (1024 * 1024 * 1024)).toFixed(1);
      return res.status(413).json({
        success: false,
        error: {
          message: "File too large",
          status: 413,
          details: `File size ${fileSizeGB}GB exceeds maximum allowed size of ${maxSizeGB}GB`,
        },
      });
    }
  }

  // Validate file type
  const { isValidFileType } = require("../config/aws");
  if (!isValidFileType(req.body.contentType)) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Invalid file type",
        status: 400,
        details: `Allowed types: ${process.env.ALLOWED_FILE_TYPES}`,
      },
    });
  }

  next();
};

module.exports = {
  configureCors,
  configureSecurity,
  configureLogging,
  errorHandler,
  notFoundHandler,
  validateRequest,
  validateFileUpload,
};
