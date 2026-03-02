declare module "parse-torrent" {
  export type ParsedFile = {
    path: string;
    name: string;
    length: number;
    offset: number;
  };

  export type ParsedTorrent = {
    infoHash?: string;
    name?: string;
    announce?: string[];
    files?: ParsedFile[];
  };

  export default function parseTorrent(input: Buffer | Uint8Array): Promise<ParsedTorrent>;

  export function toMagnetURI(input: {
    infoHash: string;
    name?: string;
    announce?: string[];
  }): string;
}
