declare module 'docxtemplater' {
  import PizZip from 'pizzip';

  interface DocxtemplaterOptions {
    paragraphLoop?: boolean;
    linebreaks?: boolean;
  }

  class Docxtemplater {
    constructor(zip: PizZip, options?: DocxtemplaterOptions);
    setData(data: Record<string, any>): void;
    render(): void;
    getZip(): PizZip;
  }

  export default Docxtemplater;
}

declare module 'pizzip' {
  interface GenerateOptions {
    type: 'nodebuffer' | 'base64' | 'string' | 'uint8array' | 'blob';
    compression?: 'DEFLATE' | 'STORE';
  }

  class PizZip {
    constructor(data?: Buffer | string | ArrayBuffer | Uint8Array);
    generate(options: GenerateOptions): Buffer | string | Uint8Array | Blob;
  }

  export default PizZip;
}
