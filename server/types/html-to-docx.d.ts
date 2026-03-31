declare module 'html-to-docx' {
  interface HtmlToDocxOptions {
    title?: string;
    font?: string;
    fontSize?: number;
    margins?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
    header?: boolean;
    footer?: boolean;
  }

  function htmlToDocx(
    html: string,
    headerHtml: string | null,
    options?: HtmlToDocxOptions
  ): Promise<ArrayBuffer>;

  export default htmlToDocx;
}
