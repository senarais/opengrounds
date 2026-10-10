import assert from "node:assert/strict";
import { test } from "vitest";
import { measureGrid } from "../components/ui/tilted-grid-hero";

test("curved gallery stays bounded and wraps beyond the visible arc at every viewport", () => {
  const bend = 55 * Math.PI / 180;
  for (const [width, height] of [[320, 260], [760, 260], [1440, 440], [2560, 440]] as const) {
    const layout = measureGrid(width, height, 68, 1.4, 7, bend);
    assert.ok(layout.columns >= 2 && layout.columns <= 60);
    assert.ok(layout.sweep >= layout.limit && layout.limit > 0);
    assert.ok(Number.isFinite(layout.unit) && layout.unit > 0);
    const tileWidth = Math.min(.68 * height, .55 * width / 1.4) * 1.4;
    assert.ok(tileWidth <= width * .55 + .001, "mobile keeps neighboring tiles visible");
  }
  assert.deepEqual(measureGrid(0, 0, 68, 1.4, 7, bend), { columns: 2, sweep: 0, unit: 0, limit: 0 });
});
