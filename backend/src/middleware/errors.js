function notFound(req, res) {
  res.status(404).json({ message: "API route not found." });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: "Please check the submitted information." });
  }
  if (error.code === 11000) return res.status(409).json({ message: "This record already exists." });
  console.error("API error:", error.message);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
}

module.exports = { notFound, errorHandler };
