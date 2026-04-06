const bytescale = require("./bytescale");
const gradeFlow = require("./gradeFlow");
const discussions = require("./discussions");
const prompts = require("./prompts");

module.exports = {
  ...bytescale,
  ...gradeFlow,
  ...discussions,
  ...prompts,
};
