// @vitest-environment node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readFixture = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("fixture corpus", () => {
  it("keeps the supported SVG fixture free of active content", () => {
    expect(readFixture("./svg/rectangle-mm.svg")).not.toMatch(/<script|\son[a-z]+=/i);
  });

  it("keeps an explicit active-content rejection fixture", () => {
    expect(readFixture("./svg/reject-script.svg")).toMatch(/<script/i);
  });

  it("keeps physical and unitless DXF fixtures distinct", () => {
    expect(readFixture("./dxf/rectangle-mm.dxf")).toContain("$INSUNITS\n70\n4");
    expect(readFixture("./dxf/rectangle-unitless.dxf")).toContain("$INSUNITS\n70\n0");
  });
});
