import { connect } from "../../../../database";
import { getHostName, websiteSearchParams } from "../../../utils";
import type { Issue } from "../../../../types/schema";

export const getIssue = async (
  { url, pageUrl, userId, noRetries }: any,
  chain?: boolean
) => {
  try {
    const [collection] = await connect("Issues");
    const queryUrl = decodeURIComponent(String(url || pageUrl));

    const searchProps = websiteSearchParams({
      pageUrl: queryUrl,
      userId,
    });

    let issue;

    // TODO: remove props and allow all
    if (Object.keys(searchProps).length) {
      issue = await collection.findOne(searchProps);

      // get issues from general bucket
      if (!issue && !noRetries) {
        issue = await collection.findOne({ pageUrl: queryUrl });
      }

      if (!issue && !noRetries) {
        issue = await collection.findOne({
          domain: getHostName(queryUrl),
        });
      }
    }

    return chain ? [issue, collection] : issue;
  } catch (e) {
    console.error(e);
    return [null, null];
  }
};

export const getIssues = async ({ userId, domain, pageUrl }: any) => {
  try {
    const [collection] = await connect("Issues");

    const searchProps = websiteSearchParams({
      domain: domain || getHostName(pageUrl),
      userId,
    });

    // TODO: PAGINATION
    return await collection
      .find(searchProps)
      .sort({ pageUrl: 1 })
      .limit(2000)
      .toArray();
  } catch (e) {
    console.error(e);
    return [];
  }
};

// get issues for a user with pagination offsets.
export const getIssuesPaging = async (params) => {
  try {
    const [collection] = await connect("Issues");
    const {
      userId,
      domain,
      pageUrl,
      limit = 20,
      offset = 0,
      all,
    } = params ?? {};

    const searchParams = websiteSearchParams({
      domain: domain || getHostName(pageUrl),
      userId,
      all,
    });

    const issues = (await collection
      .find(searchParams)
      .skip(offset)
      .limit(limit)
      .toArray()) as Issue[];

    return issues;
  } catch (e) {
    console.error(e);
    return [];
  }
};
