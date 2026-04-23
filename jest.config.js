module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.js"],
  collectCoverageFrom: ["src/**/*.js"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};