import type { ServerWritableStream } from "@grpc/grpc-js";
import { crawlTrackingEmitter } from "../../event";
import { crawlEnqueue } from "../../queues/crawl";

type ScanParams = {
  pages: string[];
  user_id: number;
  domain: string;
  full: boolean;
};

// perform scan via streams enqueueing scan
export const scanStream = async (
  call: ServerWritableStream<ScanParams, {}>
) => {
  crawlTrackingEmitter.emit("crawl-processing", call); // pass in call to determine if crawl needs to stop
  await crawlEnqueue(call.request); // queue to control output.

  call.end();
};
