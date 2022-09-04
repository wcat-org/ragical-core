import type { ServerWritableStream } from "@grpc/grpc-js";
import { crawlEnqueue } from "../../queues/crawl/crawl";
import { crawlTrackingEmitter } from "../../event";

type ScanParams = {
  pages: string[];
  user_id: number;
  domain: string;
  full: boolean;
};

export type ScanRpcCall = ServerWritableStream<ScanParams, {}>;

// perform scan via streams enqueueing scan
export const scanStream = async (call: ScanRpcCall) => {
  process.nextTick(() => {
    crawlTrackingEmitter.emit("crawl-processing", call); // pass in call to determine if crawl needs to stop
  });

  // TODO: remove queue for improved browser page handling puppeteer
  await crawlEnqueue(call.request); // queue to control output.
};
