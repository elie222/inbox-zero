#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { collectSourceFiles } = require("./lib/source-files");

const root = process.cwd();
const allowedRedirectHelper = path.join(root, "utils", "redirect.ts");
const globalLocationOwners = new Set([
  "document",
  "globalThis",
  "parent",
  "self",
  "top",
  "window",
]);
const redirectCallNames = new Set(["assign", "replace"]);
const redirectAssignmentMessage =
  "Use redirectToSafeUrl instead of assigning location.href.";
const redirectCallMessage =
  "Use redirectToSafeUrl instead of calling location redirects directly.";

const violations = [];

for (const file of collectSourceFiles(root)) {
  if (file === allowedRedirectHelper) continue;

  const content = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  violations.push(...findRestrictedRedirects(sourceFile, file));
}

if (violations.length === 0) {
  console.log("Client redirects use the safe redirect helper.");
  process.exit(0);
}

console.error(
  `Found ${violations.length} direct client redirect ${
    violations.length === 1 ? "sink" : "sinks"
  }:\n`,
);

for (const violation of violations) {
  console.error(`${path.relative(root, violation.file)}:${violation.line}`);
  console.error(`  ${violation.match}`);
  console.error(`  ${violation.message}\n`);
}

process.exit(1);

function findRestrictedRedirects(sourceFile, file) {
  const sourceViolations = [];

  visit(sourceFile);
  return sourceViolations;

  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isLocationHrefAccess(node.left)
    ) {
      sourceViolations.push(
        createViolation(sourceFile, node.left, file, {
          message: redirectAssignmentMessage,
        }),
      );
    }

    if (ts.isCallExpression(node) && isLocationRedirectCall(node.expression)) {
      sourceViolations.push(
        createViolation(sourceFile, node.expression, file, {
          message: redirectCallMessage,
        }),
      );
    }

    ts.forEachChild(node, visit);
  }
}

function createViolation(sourceFile, node, file, { message }) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return {
    file,
    line: line + 1,
    match: node.getText(sourceFile),
    message,
  };
}

function isLocationHrefAccess(expression) {
  const propertyAccess = getStaticPropertyAccess(expression);
  return (
    propertyAccess?.name === "href" &&
    isLocationExpression(propertyAccess.target)
  );
}

function isLocationRedirectCall(expression) {
  const propertyAccess = getStaticPropertyAccess(expression);
  return (
    !!propertyAccess &&
    redirectCallNames.has(propertyAccess.name) &&
    isLocationExpression(propertyAccess.target)
  );
}

function isLocationExpression(expression) {
  const locationExpression = stripExpression(expression);
  if (ts.isIdentifier(locationExpression)) {
    return locationExpression.text === "location";
  }

  const propertyAccess = getStaticPropertyAccess(locationExpression);
  return (
    propertyAccess?.name === "location" &&
    isKnownGlobalLocationOwner(propertyAccess.target)
  );
}

function isKnownGlobalLocationOwner(expression) {
  const owner = stripExpression(expression);
  return ts.isIdentifier(owner) && globalLocationOwners.has(owner.text);
}

function getStaticPropertyAccess(expression) {
  const target = stripExpression(expression);

  if (ts.isPropertyAccessExpression(target)) {
    return { target: target.expression, name: target.name.text };
  }

  if (
    ts.isElementAccessExpression(target) &&
    (ts.isStringLiteral(target.argumentExpression) ||
      ts.isNoSubstitutionTemplateLiteral(target.argumentExpression))
  ) {
    return {
      target: target.expression,
      name: target.argumentExpression.text,
    };
  }

  return null;
}

function stripExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}
