export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const globalErrorHandler = (
  err,
  req,
  res,
  next
) => {
  console.error(err);

  let statusCode = err.statusCode || 500;
  let message =
    err.message || "Internal server error";

  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource ID";
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((error) => error.message)
      .join(", ");
  }

  if (err.code === 11000) {
    statusCode = 409;

    const duplicatedField =
      Object.keys(err.keyValue || {})[0];

    message = duplicatedField
      ? `${duplicatedField} already exists`
      : "Duplicate resource";
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};