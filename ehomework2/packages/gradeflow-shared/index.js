const bytescale = require("./bytescale");
const gradeFlow = require("./gradeFlow");
const discussions = require("./discussions");
const prompts = require("./prompts");
const studentSurvey = require("./studentSurvey");
const studentIntroductions = require("./studentIntroductions");

module.exports = {
  ...bytescale,
  ...gradeFlow,
  ...discussions,
  ...prompts,
  ...studentSurvey,
  ...studentIntroductions,
};
