const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SmartLib API",
      version: "1.0.0",
      description: "Library Management System API Documentation",
    },
    servers: [
      {
        url: "http://localhost:5000",
      },
    ],
  },
  apis: ["./routes/*.js"], // scan all routes
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
