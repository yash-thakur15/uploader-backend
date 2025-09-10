require("dotenv").config();
const express = require("express");
const {
  configureCors,
  configureSecurity,
  configureLogging,
  errorHandler,
  notFoundHandler,
} = require("./middleware");
const { isS3Configured } = require("./config/aws");

// Import routes
const uploadRoutes = require("./routes/upload");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware setup
app.use(configureLogging());
app.use(configureSecurity());
app.use(configureCors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      message: "Video Uploader Backend API",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    },
  });
});

// API routes
app.use("/api/upload", uploadRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const startServer = () => {
  // Check S3 configuration
  if (!isS3Configured()) {
    console.warn(
      "⚠️  AWS S3 is not properly configured. Please check your environment variables:"
    );
    console.warn("   - AWS_REGION");
    console.warn("   - AWS_ACCESS_KEY_ID");
    console.warn("   - AWS_SECRET_ACCESS_KEY");
    console.warn("   - S3_BUCKET_NAME");
    console.warn("   The server will start but S3 operations will fail.");
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🌐 API Base URL: http://localhost:${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/`);
    console.log(`📤 Upload API: http://localhost:${PORT}/api/upload`);

    if (isS3Configured()) {
      console.log(
        `✅ AWS S3 configured for bucket: ${process.env.S3_BUCKET_NAME}`
      );
    }

    console.log("🎯 Ready to handle file uploads!");
  });
};

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
