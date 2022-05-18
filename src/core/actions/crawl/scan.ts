import { ApiResponse, responseModel, makeWebsite } from "@app/core/models";
import { ResponseModel } from "@app/core/models/response/types";
import { getHostName } from "@app/core/utils";
import { fetchPageIssues } from "./fetch-issues";
import { extractPageData } from "./extract-page-data";
import { limitIssue } from "./limit-issue";
import type { PageMindScanResponse } from "@app/schema";
import { removeTrailingSlash } from "@a11ywatch/website-source-builder";
import { SUPER_MODE } from "@app/config/config";

type ScanParams = {
  userId?: number;
  url: string;
  noStore?: boolean;
};

/**
 * Send to gRPC pagemind request. Does not store any values into the DB from request. Full req -> res.
 *
 * Examples:
 *
 *     await scanWebsite({ url: "https://a11ywatch.com" });
 *     await scanWebsite({ url: "https://a11ywatch.com", noStore: true }); // prevent storing contents to CDN from pagemind
 *     await scanWebsite({ url: "https://a11ywatch.com", userId: 122, noStore: true });
 */
export const scanWebsite = async ({
  userId,
  url,
  noStore = false,
}: ScanParams): Promise<ResponseModel> => {
  const pageUrl = removeTrailingSlash(url);
  const domain = getHostName(pageUrl);

  if (!domain) {
    return responseModel({ msgType: ApiResponse.NotFound });
  }

  if (
    process.env.NODE_ENV === "production" &&
    pageUrl.includes("http://localhost:")
  ) {
    throw new Error("Cannot use localhost, please use a valid web url.");
  }

  const website = makeWebsite({ url: pageUrl, domain });

  let dataSource: PageMindScanResponse;

  try {
    dataSource = await fetchPageIssues({
      pageHeaders: website.pageHeaders,
      url: pageUrl,
      userId,
      pageInsights: false, // TODO: get website if auth determine if Lighthouse enabled
      noStore,
      scriptsEnabled: false,
    });
  } catch (e) {
    console.error(e);
  }

  if (!dataSource) {
    return responseModel();
  }

  if (!dataSource?.webPage) {
    return {
      website: null,
      code: 300,
      success: false,
      message:
        "Website timeout exceeded threshhold for scan, website rendered too slow over 15000 ms",
    };
  }

  return new Promise((resolve, reject) => {
    try {
      const { script, issues, webPage } = extractPageData(dataSource);

      // Issues.issues returned. Map against
      let currentIssues = issues?.issues;
      let limitedCount = false;

      if (typeof userId !== "undefined") {
        website.userId = userId;
      }

      if (!SUPER_MODE && typeof userId === "undefined") {
        currentIssues = limitIssue(issues);
        limitedCount = true;
      }

      const data = Object.assign({}, website, webPage, {
        timestamp: new Date().getTime(),
        script,
        issues: currentIssues,
      });

      // return limited count from scan
      if (limitedCount) {
        data.issuesInfo.limitedCount = currentIssues.length;
      }

      resolve(
        responseModel({
          data,
        })
      );
    } catch (e) {
      reject(e);
    }
  });
};
