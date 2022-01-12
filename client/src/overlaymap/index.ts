import { CenterZoomLevel, LatLng } from "../coordinates";

export interface DrawingStyle {
  fillColor?: string;
  strokeColor?: string;
  lineWidth?: number;
  lineDash?: number[];
  strokeOutlineColor?: string;
  pointColor?: string;
  pointOutlineColor?: string;
  pointOutlineWidth?: number; // default is 1px
  pointRadius?: number;
  text?: {color: string; font: string; text: string; textBaseline: string; textAlign: string};
  image?: string;
  imageDimensions?: [number, number]; // Width, height.
}

/** Some handy type aliases. */
export type Feature = GeoJSON.Feature<GeoJSON.GeometryObject>;
export type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.GeometryObject>;

export type StyleFn = (feature: Feature) => DrawingStyle;

export interface BoxPlusLevel extends CenterZoomLevel {
  northeast: LatLng;
  southwest: LatLng;
}
