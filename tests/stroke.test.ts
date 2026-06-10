import { describe, expect, test } from "bun:test";
import { normalizeStrokeData } from "../src/stroke";

function expectOk(raw: string) {
  const result = normalizeStrokeData(raw);
  if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
  return JSON.parse(result.value);
}

function expectFail(raw: string, message?: string) {
  const result = normalizeStrokeData(raw);
  expect(result.ok).toBe(false);
  if (!result.ok && message) expect(result.message).toBe(message);
}

describe("normalizeStrokeData: pen strokes", () => {
  test("normalizes a valid pen stroke", () => {
    const value = expectOk(JSON.stringify({
      points: [{ x: 1.234, y: 2 }, { x: 3, y: 4.567 }],
      color: "#ff0000",
      width: 3,
      tool: "pen",
      opacity: 0.5,
    }));
    expect(value).toEqual({
      points: [{ x: 1.23, y: 2 }, { x: 3, y: 4.57 }],
      color: "#ff0000",
      width: 3,
      tool: "pen",
      opacity: 0.5,
      blend: "normal",
    });
  });

  test("falls back to defaults for color/tool/opacity/blend", () => {
    const value = expectOk(JSON.stringify({
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      color: "not-a-color",
      width: 2,
      tool: "marker",
      blend: "weird",
    }));
    expect(value.color).toBe("#202124");
    expect(value.tool).toBe("pen");
    expect(value.opacity).toBe(1);
    expect(value.blend).toBe("normal");
  });

  test("accepts the eraser tool", () => {
    const value = expectOk(JSON.stringify({
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      width: 10,
      tool: "eraser",
    }));
    expect(value.tool).toBe("eraser");
  });

  test("rejects empty input", () => {
    expectFail("", "涂鸦数据不能为空");
    expectFail("   ", "涂鸦数据不能为空");
  });

  test("rejects invalid JSON", () => {
    expectFail("{not json", "涂鸦数据格式不合法");
  });

  test("rejects too few or too many points", () => {
    expectFail(JSON.stringify({ points: [{ x: 0, y: 0 }], width: 2 }), "涂鸦点位不合法");
    const tooMany = Array.from({ length: 1001 }, (_, i) => ({ x: i, y: i }));
    expectFail(JSON.stringify({ points: tooMany, width: 2 }), "涂鸦点位不合法");
  });

  test("rejects non-finite point coordinates", () => {
    expectFail(JSON.stringify({ points: [{ x: 0, y: 0 }, { x: "oops", y: 1 }], width: 2 }), "涂鸦点位不合法");
  });

  test("rejects out-of-range pen widths", () => {
    expectFail(JSON.stringify({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 0.5 }), "画笔粗细不合法");
    expectFail(JSON.stringify({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 81 }), "画笔粗细不合法");
  });

  test("rejects oversized payloads", () => {
    expectFail(`"${"x".repeat(20001)}"`, "涂鸦数据过大");
  });
});

describe("normalizeStrokeData: image elements", () => {
  const validImage = {
    type: "image",
    src: "/api/projects/test-board/assets/0a1b2c3d-4e5f.png",
    x: 10.123,
    y: 20,
    width: 100,
    height: 80,
  };

  test("normalizes a valid image element", () => {
    const value = expectOk(JSON.stringify(validImage));
    expect(value.type).toBe("image");
    expect(value.src).toBe(validImage.src);
    expect(value.x).toBe(10.12);
    expect(value.rotation).toBe(0);
  });

  test("accepts the boards alias in src", () => {
    const value = expectOk(JSON.stringify({ ...validImage, src: "/api/boards/test-board/assets/0a1b2c3d.webp" }));
    expect(value.type).toBe("image");
  });

  test("rejects off-origin or non-asset src", () => {
    expectFail(JSON.stringify({ ...validImage, src: "https://evil.example/x.png" }), "图片地址不合法");
    expectFail(JSON.stringify({ ...validImage, src: "/api/projects/test-board/assets/../secret.png" }), "图片地址不合法");
  });

  test("rejects out-of-range dimensions", () => {
    expectFail(JSON.stringify({ ...validImage, width: 5 }), "图片尺寸不合法");
    expectFail(JSON.stringify({ ...validImage, height: 5000 }), "图片尺寸不合法");
  });
});

describe("normalizeStrokeData: pdf elements", () => {
  const validPdf = {
    type: "pdf",
    src: "/api/projects/test-board/assets/0a1b2c3d.pdf",
    x: 0,
    y: 0,
    width: 600,
    height: 1600,
    pageCount: 2,
  };

  test("normalizes a valid pdf element", () => {
    const value = expectOk(JSON.stringify(validPdf));
    expect(value.type).toBe("pdf");
    expect(value.pageCount).toBe(2);
    expect(value.pageGap).toBe(24);
  });

  test("rejects mismatched pageHeights length", () => {
    expectFail(JSON.stringify({ ...validPdf, pageHeights: [800] }), "PDF 页面信息不一致");
  });

  test("rejects out-of-range currentPageIndex", () => {
    expectFail(JSON.stringify({ ...validPdf, currentPageIndex: 2 }), "PDF 当前页不合法");
  });
});

describe("normalizeStrokeData: text elements", () => {
  test("normalizes a valid text element", () => {
    const value = expectOk(JSON.stringify({
      type: "text",
      text: "  hello  ",
      x: 1,
      y: 2,
      width: 120,
      height: 40,
      fontSize: 16,
      align: "center",
      bold: true,
    }));
    expect(value.text).toBe("hello");
    expect(value.align).toBe("center");
    expect(value.bold).toBe(true);
    expect(value.italic).toBe(false);
  });

  test("rejects empty text", () => {
    expectFail(JSON.stringify({ type: "text", text: "   ", x: 0, y: 0, width: 100, height: 40, fontSize: 16 }), "文本不能为空");
  });
});

describe("normalizeStrokeData: mindmap elements", () => {
  const validMindmap = {
    type: "mindmap",
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    fontSize: 14,
    nodes: [
      { id: "a", text: "root", x: 10, y: 10, width: 120, height: 40 },
      { id: "b", text: "child", x: 200, y: 10, width: 120, height: 40 },
    ],
    edges: [{ from: "a", to: "b" }],
  };

  test("normalizes a valid mindmap", () => {
    const value = expectOk(JSON.stringify(validMindmap));
    expect(value.type).toBe("mindmap");
    expect(value.nodes).toHaveLength(2);
    expect(value.edges).toEqual([{ from: "a", to: "b" }]);
  });

  test("rejects duplicate node ids", () => {
    expectFail(JSON.stringify({
      ...validMindmap,
      nodes: [
        { id: "a", text: "one", x: 0, y: 0, width: 100, height: 30 },
        { id: "a", text: "two", x: 0, y: 50, width: 100, height: 30 },
      ],
      edges: [],
    }), "思维导图节点不合法");
  });

  test("rejects edges pointing at unknown nodes", () => {
    expectFail(JSON.stringify({ ...validMindmap, edges: [{ from: "a", to: "nope" }] }), "思维导图连线不合法");
  });

  test("passes nodeScale through and rounds it", () => {
    const value = expectOk(JSON.stringify({ ...validMindmap, nodeScale: 1.23456 }));
    expect(value.nodeScale).toBe(1.235);
  });

  test("omits nodeScale when absent (legacy rows)", () => {
    const value = expectOk(JSON.stringify(validMindmap));
    expect(value.nodeScale).toBeUndefined();
  });

  test("rejects out-of-range nodeScale", () => {
    expectFail(JSON.stringify({ ...validMindmap, nodeScale: 0.1 }), "思维导图缩放不合法");
    expectFail(JSON.stringify({ ...validMindmap, nodeScale: 9 }), "思维导图缩放不合法");
    expectFail(JSON.stringify({ ...validMindmap, nodeScale: "big" }), "思维导图缩放不合法");
  });

  test("accepts scaled-up dimensions and fonts within the new caps", () => {
    const value = expectOk(JSON.stringify({
      ...validMindmap,
      width: 6000,
      height: 5000,
      fontSize: 100,
      nodeScale: 3,
    }));
    expect(value.width).toBe(6000);
    expect(value.fontSize).toBe(100);
  });

  test("keeps multi-line node text up to 300 chars", () => {
    const text = `第一行\n第二行\n${"长".repeat(400)}`;
    const value = expectOk(JSON.stringify({
      ...validMindmap,
      nodes: [{ id: "a", text, x: 10, y: 10, width: 120, height: 40 }],
      edges: [],
    }));
    expect(value.nodes[0].text.length).toBe(300);
    expect(value.nodes[0].text).toContain("\n");
  });
});
