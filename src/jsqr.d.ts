declare module 'jsqr' {
  interface QRPoint { x: number; y: number }
  interface QRLocation {
    topRightCorner: QRPoint;
    topLeftCorner: QRPoint;
    bottomRightCorner: QRPoint;
    bottomLeftCorner: QRPoint;
    topRightFinderPattern: QRPoint;
    topLeftFinderPattern: QRPoint;
    bottomLeftFinderPattern: QRPoint;
  }
  interface QRCode {
    binaryData: number[];
    data: string;
    chunks: unknown[];
    version: number;
    location: QRLocation;
  }
  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
  ): QRCode | null;
  export default jsQR;
}
