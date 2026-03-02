declare module "bittorrent-tracker" {
  type ScrapeData = {
    complete?: number;
    incomplete?: number;
    downloaded?: number;
    infoHash?: string;
    announce?: string;
  };

  export default class TrackerClient {
    static scrape(
      opts: { announce: string; infoHash: string | string[] },
      cb: (err: Error | null, data?: ScrapeData) => void,
    ): TrackerClient;

    destroy(): void;
  }
}
