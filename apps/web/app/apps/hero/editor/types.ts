export type Point = [number, number];

export interface CubicSegment {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

export interface EditableContour {
  closed: boolean;
  segments: CubicSegment[];
}

export interface SelectedPoint {
  contourIndex: number;
  segmentIndex: number;
  pointType: "p0" | "p3" | "c1" | "c2";
}

export type EditorTool = "select" | "pen" | "hand";
